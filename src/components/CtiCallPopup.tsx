import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Phone, X } from "lucide-react";
import { format } from "date-fns";

/**
 * CTI着信ポップ。cti_calls への INSERT を Realtime で受け取り、
 * 発信者の顧客情報（名前・来店回数・最終来店・NG）を全管理画面共通で表示する。
 */

interface CtiCall {
  id: string;
  from_number: string;
  status: string;
  customer_id: string | null;
  customer_name: string | null;
  duration_seconds: number | null;
}

interface ExtraInfo {
  visit_count: number | null;
  last_visited: string | null;
  ng_items: string | null;
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
  const [info, setInfo] = useState<ExtraInfo | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const ch = supabase
      .channel("cti-calls-popup")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "cti_calls" },
        (payload) => {
          setInfo(null);
          setCall(payload.new as CtiCall);
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "cti_calls" },
        (payload) => {
          const updated = payload.new as CtiCall;
          setCall((prev) => (prev && prev.id === updated.id ? updated : prev));
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  // 顧客が特定できたら追加情報（来店回数・最終来店・NG）を取得
  useEffect(() => {
    if (!call?.customer_id) return;
    let cancelled = false;
    (async () => {
      const [custRes, profRes] = await Promise.all([
        supabase.from("customers").select("visit_count, last_visited").eq("id", call.customer_id!).maybeSingle(),
        supabase.from("customer_profiles").select("ng_items").eq("customer_id", call.customer_id!).maybeSingle(),
      ]);
      if (cancelled) return;
      setInfo({
        visit_count: (custRes.data as any)?.visit_count ?? null,
        last_visited: (custRes.data as any)?.last_visited ?? null,
        ng_items: (profRes.data as any)?.ng_items ?? null,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [call?.customer_id]);

  // 通話結果が出たら10秒後、着信中のままなら2分後に自動で閉じる
  useEffect(() => {
    if (!call) return;
    const ms = call.status === "ringing" ? 120000 : 10000;
    const t = setTimeout(() => setCall(null), ms);
    return () => clearTimeout(t);
  }, [call]);

  if (!call) return null;

  const ringing = call.status === "ringing";

  return (
    <div className="fixed bottom-4 right-4 z-[60] w-[320px] max-w-[calc(100vw-2rem)] rounded-2xl border bg-card shadow-2xl overflow-hidden">
      <div className={`flex items-center gap-2 px-4 py-2.5 text-white ${ringing ? "bg-green-600" : call.status === "completed" ? "bg-gray-700" : "bg-rose-600"}`}>
        <Phone size={16} className={ringing ? "animate-pulse" : ""} />
        <span className="text-sm font-bold flex-1">
          📞 {STATUS_LABEL[call.status] ?? call.status}
          {call.status === "completed" && call.duration_seconds
            ? `（${Math.floor(call.duration_seconds / 60)}分${call.duration_seconds % 60}秒）`
            : ""}
        </span>
        <button onClick={() => setCall(null)} className="text-white/80 hover:text-white">
          <X size={16} />
        </button>
      </div>
      <div className="px-4 py-3 space-y-1.5">
        <p className="text-lg font-bold leading-tight">
          {call.customer_name ? `${call.customer_name} 様` : "未登録のお客様"}
        </p>
        <p className="text-sm text-muted-foreground tabular-nums">{call.from_number}</p>
        {call.customer_id && info && (
          <div className="text-xs text-muted-foreground space-y-0.5 pt-1 border-t">
            <p>
              来店{info.visit_count ?? 0}回
              {info.last_visited && ` ・ 最終 ${format(new Date(info.last_visited), "M/d")}`}
            </p>
            {info.ng_items && (
              <p className="text-orange-600 font-medium">⚠️ NG：{info.ng_items}</p>
            )}
          </div>
        )}
        <div className="flex gap-2 pt-2">
          {call.customer_id && (
            <button
              onClick={() => {
                navigate("/database/customers?tab=sales");
                setCall(null);
              }}
              className="flex-1 h-8 rounded-md bg-primary text-primary-foreground text-xs font-medium"
            >
              顧客カルテ
            </button>
          )}
          <button
            onClick={() => {
              navigate("/cti-calls");
              setCall(null);
            }}
            className="flex-1 h-8 rounded-md border text-xs font-medium hover:bg-muted/50"
          >
            着信履歴
          </button>
        </div>
      </div>
    </div>
  );
};
