import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { CalendarPlus, Phone, X } from "lucide-react";
import { format } from "date-fns";
import { useAdminStore } from "@/hooks/useAdminStore";
import { getCustomerRank } from "@/lib/customerRank";
import { reservationUrlForCall } from "@/lib/incomingCall";

/**
 * CTI着信ポップ。cti_calls への INSERT を Realtime で受け取り、
 * 発信者の顧客データ（ランク・来店・前回の担当・NG・好み・最近の来店）を全管理画面共通で表示する。
 * 「予約を入力」で予約入力（/admin-schedule の新規予約）を電話番号入りで開く。
 * 着信の記録は Edge Function cti-incoming（Twilioの050番号の着信Webhook）。他店の着信は RLS で見えない。
 */

interface CtiCall {
  id: string;
  store_id: string;
  from_number: string;
  status: string;
  customer_id: string | null;
  customer_name: string | null;
  duration_seconds: number | null;
}

interface CustomerCard {
  visit_count: number | null;
  total_spent: number | null;
  last_visited: string | null;
  tags: string[] | null;
  is_banned: boolean | null;
  ban_reason: string | null;
  last_cast_name: string | null;
  ng_items: string | null;
  preference_notes: string | null;
  ng_casts: string[];
  recent: Array<{ date: string; cast: string | null; course: string | null }>;
}

const STATUS_LABEL: Record<string, string> = {
  ringing: "着信中",
  completed: "応答済み",
  "no-answer": "不在着信",
  busy: "話中",
  failed: "接続失敗",
};

export const CtiCallPopup = () => {
  const [call, setCall] = useState<CtiCall | null>(null);
  const [card, setCard] = useState<CustomerCard | null>(null);
  const navigate = useNavigate();
  const { store } = useAdminStore();
  const storeId = store?.id ?? null;

  useEffect(() => {
    if (!storeId) return;
    const ch = supabase
      .channel(`cti-calls-popup-${storeId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "cti_calls", filter: `store_id=eq.${storeId}` },
        (payload) => {
          setCard(null);
          setCall(payload.new as CtiCall);
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "cti_calls", filter: `store_id=eq.${storeId}` },
        (payload) => {
          const updated = payload.new as CtiCall;
          setCall((prev) => (prev && prev.id === updated.id ? updated : prev));
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [storeId]);

  // 顧客が特定できたら、カルテの要点（ランク・来店・前回の担当・NG・好み・最近の来店）を取得
  useEffect(() => {
    if (!call?.customer_id) return;
    let cancelled = false;
    (async () => {
      const customerId = call.customer_id!;
      const [custRes, profRes, ngRes] = await Promise.all([
        supabase.from("customers")
          .select("phone, visit_count, total_spent, last_visited, tags, is_banned, ban_reason, last_cast_id")
          .eq("id", customerId).maybeSingle(),
        supabase.from("customer_profiles").select("ng_items, preference_notes").eq("customer_id", customerId).maybeSingle(),
        supabase.from("customer_ng_casts").select("casts(name)").eq("customer_id", customerId),
      ]);
      const customer = custRes.data as {
        phone: string | null; visit_count: number | null; total_spent: number | null; last_visited: string | null;
        tags: string[] | null; is_banned: boolean | null; ban_reason: string | null; last_cast_id: string | null;
      } | null;
      const profile = profRes.data as { ng_items: string | null; preference_notes: string | null } | null;
      const ngRows = (ngRes.data ?? []) as Array<{ casts: { name: string | null } | null }>;
      const rawPhone = String(customer?.phone || call.from_number || "").trim();
      const phone = rawPhone.replace(/[-\s]/g, "");
      const phoneFilter = [...new Set([phone, rawPhone].filter((value) => /^[\d-]+$/.test(value)))]
        .map((value) => `customer_phone.eq.${value}`).join(",");
      const [castRes, recentRes] = await Promise.all([
        customer?.last_cast_id
          ? supabase.from("casts").select("name").eq("id", customer.last_cast_id).maybeSingle()
          : Promise.resolve({ data: null }),
        phoneFilter
          ? supabase.from("reservations")
            .select("reservation_date, course_name, casts(name)")
            .eq("store_id", call.store_id)
            .or(phoneFilter)
            .eq("status", "completed")
            .order("reservation_date", { ascending: false })
            .limit(3)
          : Promise.resolve({ data: [] }),
      ]);
      if (cancelled) return;
      setCard({
        visit_count: customer?.visit_count ?? null,
        total_spent: customer?.total_spent ?? null,
        last_visited: customer?.last_visited ?? null,
        tags: customer?.tags ?? null,
        is_banned: customer?.is_banned ?? null,
        ban_reason: customer?.ban_reason ?? null,
        last_cast_name: (castRes.data as { name?: string } | null)?.name ?? null,
        ng_items: profile?.ng_items ?? null,
        preference_notes: profile?.preference_notes ?? null,
        ng_casts: ngRows.map((row) => row.casts?.name).filter((name): name is string => Boolean(name)),
        recent: ((recentRes.data ?? []) as Array<{
          reservation_date: string; course_name: string | null; casts: { name: string | null } | null;
        }>).map((row) => ({
          date: row.reservation_date,
          cast: row.casts?.name ?? null,
          course: row.course_name ?? null,
        })),
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [call?.customer_id, call?.from_number, call?.store_id]);

  // 通話結果が出たら30秒後、着信中のままなら3分後に自動で閉じる
  useEffect(() => {
    if (!call) return;
    const ms = call.status === "ringing" ? 180000 : 30000;
    const t = setTimeout(() => setCall(null), ms);
    return () => clearTimeout(t);
  }, [call]);

  if (!call) return null;

  const ringing = call.status === "ringing";
  const rank = card ? getCustomerRank({ visit_count: card.visit_count, total_spent: card.total_spent, tags: card.tags }) : null;

  return (
    <div className="fixed bottom-4 right-4 z-[60] w-[360px] max-w-[calc(100vw-2rem)] rounded-2xl border bg-card shadow-2xl overflow-hidden">
      <div className={`flex items-center gap-2 px-4 py-2.5 text-white ${ringing ? "bg-green-600" : call.status === "completed" ? "bg-gray-700" : "bg-rose-600"}`}>
        <Phone size={16} className={ringing ? "animate-pulse" : ""} />
        <span className="text-sm font-bold flex-1">
          📞 {STATUS_LABEL[call.status] ?? call.status}
          {call.status === "completed" && call.duration_seconds
            ? `（${Math.floor(call.duration_seconds / 60)}分${call.duration_seconds % 60}秒）`
            : ""}
        </span>
        <button onClick={() => setCall(null)} className="text-white/80 hover:text-white" aria-label="閉じる">
          <X size={16} />
        </button>
      </div>
      <div className="px-4 py-3 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-lg font-bold leading-tight">
            {call.customer_name ? `${call.customer_name} 様` : "未登録のお客様"}
          </p>
          {rank && <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${rank.className}`}>{rank.label}</span>}
          {card?.is_banned && <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">⛔ 出入り禁止</span>}
        </div>
        <p className="text-sm text-muted-foreground tabular-nums">{call.from_number}</p>
        {call.customer_id && card && (
          <div className="text-xs space-y-1 pt-2 border-t">
            <p className="text-muted-foreground">
              来店{card.visit_count ?? 0}回
              {card.last_visited && ` ・ 最終 ${format(new Date(card.last_visited), "M/d")}`}
              {card.last_cast_name && ` ・ 前回 ${card.last_cast_name}`}
            </p>
            {card.is_banned && card.ban_reason && <p className="text-red-600 font-medium">禁止理由：{card.ban_reason}</p>}
            {card.ng_casts.length > 0 && <p className="text-orange-600 font-medium">⚠️ NGセラピスト：{card.ng_casts.join("、")}</p>}
            {card.ng_items && <p className="text-orange-600 font-medium">⚠️ NG：{card.ng_items}</p>}
            {card.preference_notes && <p className="text-muted-foreground line-clamp-2">好み：{card.preference_notes}</p>}
            {card.recent.length > 0 && (
              <div className="pt-1 space-y-0.5">
                {card.recent.map((visit, index) => (
                  <p key={`${visit.date}-${index}`} className="text-muted-foreground tabular-nums">
                    {format(new Date(`${visit.date}T00:00:00`), "M/d")} {visit.cast ?? "—"} {visit.course ?? ""}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="flex gap-2 pt-1">
          <button
            onClick={() => {
              navigate(reservationUrlForCall(call.from_number));
              setCall(null);
            }}
            disabled={Boolean(card?.is_banned)}
            className="flex-1 h-9 rounded-md bg-primary text-primary-foreground text-sm font-bold inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            <CalendarPlus size={15} />予約を入力
          </button>
          {call.customer_id && (
            <button
              onClick={() => {
                navigate(`/database/customers/${call.customer_id}`);
                setCall(null);
              }}
              className="h-9 px-3 rounded-md border text-xs font-medium hover:bg-muted/50"
            >
              顧客カルテ
            </button>
          )}
          <button
            onClick={() => {
              navigate("/cti-calls");
              setCall(null);
            }}
            className="h-9 px-3 rounded-md border text-xs font-medium hover:bg-muted/50"
          >
            着信履歴
          </button>
        </div>
      </div>
    </div>
  );
};
