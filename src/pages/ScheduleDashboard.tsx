import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { addDays, endOfMonth, format, startOfMonth } from "date-fns";
import { CalendarDays, CalendarRange, Inbox, ListChecks, Users } from "lucide-react";
import { AdminPageShell } from "@/components/AdminPageShell";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAdminStore } from "@/hooks/useAdminStore";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import WebBookings from "./WebBookings";
import AvailableSlots from "./AvailableSlots";
import EstamaSyncHistory from "./EstamaSyncHistory";

// スケジュールダッシュボード（/schedule-dashboard）：設定・HP・ナレッジのダッシュボードと同じ作り（?tab=）。
// 予約一覧（以前のWEB予約受付を引き継ぎ、WEBフォーム／セラピストフォーム／スタッフ受付／えすたま仮予約の4タブ）・空き枠・エスたま自動化履歴をタブで入れる。
// 日別予約情報（予約表）と月別シフトは画面いっぱいに使うので、今まで通り別のページ（概要とサイドバーから開く）。
const TABS = [
  { value: "overview", label: "概要" },
  { value: "reservations", label: "予約一覧" },
  { value: "slots", label: "空き枠" },
  { value: "estama", label: "エスたま自動化履歴" },
];

// 営業日は朝6時切り替え
const businessToday = () => {
  const now = new Date();
  return now.getHours() < 6 ? addDays(now, -1) : now;
};

interface Summary {
  reservationsToday: number;
  castsToday: number;
  reservationsMonth: number;
  webUnhandled: number;
  castFormUnhandled: number;
}

function Overview({ onOpen }: { onOpen: (tab: string, extra?: Record<string, string>) => void }) {
  const { storeId, loading: storeLoading } = useAdminStore();
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    if (storeLoading || !storeId) return;
    void (async () => {
      const today = format(businessToday(), "yyyy-MM-dd");
      const monthStart = format(startOfMonth(businessToday()), "yyyy-MM-dd");
      const monthEnd = format(endOfMonth(businessToday()), "yyyy-MM-dd");
      const [todayRes, shiftsRes, monthRes, webRes] = await Promise.all([
        supabase.from("reservations").select("id", { count: "exact", head: true }).eq("store_id", storeId).eq("reservation_date", today).neq("status", "cancelled"),
        supabase.from("shifts").select("cast_id").eq("store_id", storeId).eq("shift_date", today).not("status", "in", "(cancelled,rejected)"),
        supabase.from("reservations").select("id", { count: "exact", head: true }).eq("store_id", storeId).gte("reservation_date", monthStart).lte("reservation_date", monthEnd).neq("status", "cancelled"),
        supabase.from("reservations").select("booking_origin").eq("store_id", storeId).in("booking_origin", ["web_form", "cast_form"]).eq("web_booking_status", "unhandled"),
      ]);
      const web = (webRes.data ?? []) as { booking_origin: string }[];
      setSummary({
        reservationsToday: todayRes.count ?? 0,
        castsToday: new Set(((shiftsRes.data ?? []) as { cast_id: string }[]).map((row) => row.cast_id)).size,
        reservationsMonth: monthRes.count ?? 0,
        webUnhandled: web.filter((row) => row.booking_origin === "web_form").length,
        castFormUnhandled: web.filter((row) => row.booking_origin === "cast_form").length,
      });
    })();
  }, [storeId, storeLoading]);

  const stats = [
    { label: "本日の予約", value: summary?.reservationsToday, unit: "件", go: () => onOpen("reservations", { source: "staff" }) },
    { label: "本日の出勤", value: summary?.castsToday, unit: "名", href: "/schedule/monthly-shift" },
    { label: "今月の予約", value: summary?.reservationsMonth, unit: "件", go: () => onOpen("reservations", { source: "staff" }) },
    { label: "未対応のWEB予約", value: summary ? summary.webUnhandled + summary.castFormUnhandled : undefined, unit: "件", alert: true,
      go: () => onOpen("reservations", { source: summary && summary.webUnhandled === 0 && summary.castFormUnhandled > 0 ? "cast_form" : "web_form" }) },
  ];

  const pages = [
    { href: "/admin-schedule", label: "日別予約情報", sub: "予約表（タイムライン）で予約の入力・変更", icon: CalendarDays },
    { href: "/schedule/monthly-shift", label: "月別シフト", sub: "月のシフトの入力・確認", icon: CalendarRange },
  ];
  const tabs = [
    { tab: "reservations", label: "予約一覧", sub: "WEBフォーム・セラピストフォーム・スタッフ受付・えすたま仮予約", icon: Inbox },
    { tab: "slots", label: "空き枠", sub: "今日の空いている時間", icon: ListChecks },
    { tab: "estama", label: "エスたま自動化履歴", sub: "プロフィール・シフト同期などの結果", icon: Users },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map((stat) => {
          const body = (
            <Card className={`h-full transition-colors hover:border-primary/40 ${stat.alert && (stat.value ?? 0) > 0 ? "border-rose-300 bg-rose-50/60" : ""}`}>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">{stat.label}</p>
                <p className={`mt-1 text-2xl font-bold tabular-nums ${stat.alert && (stat.value ?? 0) > 0 ? "text-rose-600" : ""}`}>
                  {stat.value ?? "—"}<span className="ml-0.5 text-xs font-normal text-muted-foreground">{stat.unit}</span>
                </p>
              </CardContent>
            </Card>
          );
          return stat.href
            ? <Link key={stat.label} to={stat.href}>{body}</Link>
            : <button key={stat.label} type="button" className="text-left" onClick={stat.go}>{body}</button>;
        })}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {pages.map(({ href, label, sub, icon: Icon }) => (
          <Link key={href} to={href}>
            <Card className="h-full transition-colors hover:border-primary/40">
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon size={20} /></div>
                <div className="min-w-0"><p className="font-semibold">{label}</p><p className="text-xs text-muted-foreground">{sub}</p></div>
              </CardContent>
            </Card>
          </Link>
        ))}
        {tabs.map(({ tab, label, sub, icon: Icon }) => (
          <button key={tab} type="button" className="text-left" onClick={() => onOpen(tab)}>
            <Card className="h-full transition-colors hover:border-primary/40">
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-muted"><Icon size={20} /></div>
                <div className="min-w-0"><p className="font-semibold">{label}</p><p className="text-xs text-muted-foreground">{sub}</p></div>
              </CardContent>
            </Card>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function ScheduleDashboard() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const requested = params.get("tab");
  const tab = TABS.some((item) => item.value === requested) ? requested! : "overview";

  useEffect(() => {
    if (!authLoading && !user) navigate("/login");
  }, [authLoading, navigate, user]);

  const openTab = useCallback((next: string, extra?: Record<string, string>) => {
    setParams({ tab: next, ...(extra ?? {}) });
    window.scrollTo({ top: 0 });
  }, [setParams]);

  return (
    <AdminPageShell mainClassName="p-3 sm:p-6">
      <div className="mx-auto max-w-6xl">
        <h1 className="mb-4 text-2xl font-bold">スケジュールダッシュボード</h1>
        <Tabs value={tab} onValueChange={(value) => setParams({ tab: value }, { replace: true })}>
          <TabsList className="mb-4 flex h-auto w-full justify-start overflow-x-auto">
            {TABS.map((item) => <TabsTrigger key={item.value} value={item.value} className="shrink-0">{item.label}</TabsTrigger>)}
          </TabsList>
          <TabsContent value="overview"><Overview onOpen={openTab} /></TabsContent>
          <TabsContent value="reservations">{tab === "reservations" && <WebBookings embedded />}</TabsContent>
          <TabsContent value="slots">{tab === "slots" && <AvailableSlots embedded />}</TabsContent>
          <TabsContent value="estama">{tab === "estama" && <EstamaSyncHistory embedded />}</TabsContent>
        </Tabs>
      </div>
    </AdminPageShell>
  );
}
