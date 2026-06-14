import { useState, useEffect } from "react";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/Sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO } from "date-fns";
import { ja } from "date-fns/locale";
import { toast } from "sonner";
import { Check, RefreshCw } from "lucide-react";

interface SalesRecord {
  id: string;
  date: string;
  cast_id: string | null;
  cash_amount: number;
  card_amount: number;
  paypay_amount: number;
  total_amount: number;
  customer_count: number;
  notes: string | null;
  status: string;
  created_at: string;
  casts: { name: string } | null;
}

interface CleaningRecord {
  id: string;
  date: string;
  room_cleaned: boolean;
  supplies_stocked: boolean;
  trash_taken_out: boolean;
  equipment_checked: boolean;
  notes: string | null;
  status: string;
  created_at: string;
  casts: { name: string } | null;
}

interface FeedbackRecord {
  id: string;
  date: string;
  rating: number;
  good_points: string | null;
  improvement_points: string | null;
  customer_feedback: string | null;
  status: string;
  created_at: string;
  casts: { name: string } | null;
}

type Tab = "sales" | "cleaning" | "feedback";

const yen = (v: number) => `¥${v.toLocaleString()}`;
const fmtDate = (d: string) => format(parseISO(d), "M月d日(E)", { locale: ja });

export default function SalesPendingReports() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("sales");
  const [salesRecords, setSalesRecords] = useState<SalesRecord[]>([]);
  const [cleaningRecords, setCleaningRecords] = useState<CleaningRecord[]>([]);
  const [feedbackRecords, setFeedbackRecords] = useState<FeedbackRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  // key: "YYYY-MM-DD_castId" → 予約合計金額
  const [reservationTotals, setReservationTotals] = useState<Record<string, number>>({});

  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !user) navigate("/login");
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) fetchAll();
  }, [user, showAll]);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const statusFilter = showAll ? ["pending", "confirmed"] : ["pending"];
      const [s, c, f] = await Promise.all([
        supabase
          .from("daily_sales_records")
          .select("*, cast_id, casts(name)")
          .in("status", statusFilter)
          .order("date", { ascending: false }),
        supabase
          .from("cleaning_checklists")
          .select("*, casts(name)")
          .in("status", statusFilter)
          .order("date", { ascending: false }),
        supabase
          .from("daily_feedback")
          .select("*, casts(name)")
          .in("status", statusFilter)
          .order("date", { ascending: false }),
      ]);
      const salesData = (s.data as SalesRecord[]) || [];
      setSalesRecords(salesData);
      setCleaningRecords((c.data as CleaningRecord[]) || []);
      setFeedbackRecords((f.data as FeedbackRecord[]) || []);

      // 予約合計を (date, cast_id) ごとに取得
      const uniqueDates = [...new Set(salesData.map((r) => r.date))];
      if (uniqueDates.length > 0) {
        const { data: resData } = await supabase
          .from("reservations")
          .select("cast_id, reservation_date, price, payment_fee")
          .in("reservation_date", uniqueDates)
          .neq("status", "cancelled");
        const totalsMap: Record<string, number> = {};
        for (const res of resData || []) {
          const key = `${res.reservation_date}_${res.cast_id}`;
          totalsMap[key] = (totalsMap[key] ?? 0) + (res.price ?? 0) + (res.payment_fee ?? 0);
        }
        setReservationTotals(totalsMap);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const confirm = async (table: string, id: string, setter: (id: string) => void) => {
    setConfirming(id);
    try {
      const { error } = await supabase
        .from(table)
        .update({ status: "confirmed" })
        .eq("id", id);
      if (error) throw error;
      toast.success("確認済みにしました");
      setter(id);
    } catch (e: any) {
      toast.error(`失敗しました：${e?.message ?? "不明なエラー"}`);
    } finally {
      setConfirming(null);
    }
  };

  const confirmSales = (id: string) => {
    confirm("daily_sales_records", id, (rid) =>
      setSalesRecords((rs) => rs.map((r) => r.id === rid ? { ...r, status: "confirmed" } : r))
    );
  };
  const confirmCleaning = (id: string) => {
    confirm("cleaning_checklists", id, (rid) =>
      setCleaningRecords((rs) => rs.map((r) => r.id === rid ? { ...r, status: "confirmed" } : r))
    );
  };
  const confirmFeedback = (id: string) => {
    confirm("daily_feedback", id, (rid) =>
      setFeedbackRecords((rs) => rs.map((r) => r.id === rid ? { ...r, status: "confirmed" } : r))
    );
  };

  const pendingCount = {
    sales: salesRecords.filter((r) => r.status === "pending").length,
    cleaning: cleaningRecords.filter((r) => r.status === "pending").length,
    feedback: feedbackRecords.filter((r) => r.status === "pending").length,
  };

  const tabLabel = (key: Tab, label: string) => (
    <button
      onClick={() => setTab(key)}
      className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
        tab === key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted/50"
      }`}
    >
      {label}
      {pendingCount[key] > 0 && (
        <span className="ml-2 bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5">
          {pendingCount[key]}
        </span>
      )}
    </button>
  );

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="pt-[60px] md:ml-[240px] p-6">
        <div className="max-w-4xl mx-auto">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">確認待ちボックス</h1>
              <p className="text-muted-foreground text-sm">セラピストからの報告を確認してください</p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowAll(!showAll)}>
                {showAll ? "未確認のみ" : "すべて表示"}
              </Button>
              <Button variant="ghost" size="sm" onClick={fetchAll}>
                <RefreshCw size={14} />
              </Button>
            </div>
          </div>

          <div className="flex gap-2 mb-4">
            {tabLabel("sales", "売上報告")}
            {tabLabel("cleaning", "清掃チェック")}
            {tabLabel("feedback", "フィードバック")}
          </div>

          {loading ? (
            <div className="text-center text-muted-foreground py-12">読み込み中...</div>
          ) : tab === "sales" ? (
            salesRecords.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">確認待ちの報告はありません</CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {salesRecords.map((r) => {
                  const resTotal = r.cast_id ? (reservationTotals[`${r.date}_${r.cast_id}`] ?? null) : null;
                  const diff = resTotal !== null ? r.total_amount - resTotal : null;
                  const hasDiff = diff !== null && diff !== 0;
                  return (
                  <Card key={r.id} className={hasDiff ? "border-orange-300" : ""}>
                    <CardContent className="pt-4 pb-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-1.5 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">{fmtDate(r.date)}</span>
                            <span className="text-sm text-muted-foreground">{r.casts?.name ?? "不明"}</span>
                            {r.status === "confirmed" ? (
                              <Badge variant="secondary">確認済</Badge>
                            ) : (
                              <Badge variant="destructive">未確認</Badge>
                            )}
                            {hasDiff && (
                              <Badge className="bg-orange-100 text-orange-700 border-orange-300 text-xs">差異あり</Badge>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-3 text-sm tabular-nums">
                            <span>申請額 <strong>{yen(r.total_amount)}</strong></span>
                            <span className="text-muted-foreground">現金 {yen(r.cash_amount)}</span>
                            <span className="text-muted-foreground">カード {yen(r.card_amount)}</span>
                            <span className="text-muted-foreground">PayPay {yen(r.paypay_amount)}</span>
                            <span className="text-muted-foreground">{r.customer_count}件</span>
                          </div>
                          {/* 予約データとの比較 */}
                          {resTotal !== null && (
                            <div className={`flex items-center gap-2 text-xs px-2 py-1 rounded ${hasDiff ? "bg-orange-50 text-orange-700" : "bg-green-50 text-green-700"}`}>
                              <span>予約データ合計: <strong>{yen(resTotal)}</strong></span>
                              {hasDiff && (
                                <span className="font-semibold">
                                  （{diff! > 0 ? "+" : ""}{yen(diff!)} のズレ）
                                </span>
                              )}
                              {!hasDiff && <span>✓ 一致</span>}
                            </div>
                          )}
                          {r.notes && <p className="text-xs text-muted-foreground">{r.notes}</p>}
                        </div>
                        {r.status === "pending" && (
                          <Button
                            size="sm"
                            onClick={() => confirmSales(r.id)}
                            disabled={confirming === r.id}
                          >
                            <Check size={14} className="mr-1" />確認
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                  );
                })}
              </div>
            )
          ) : tab === "cleaning" ? (
            cleaningRecords.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">確認待ちの報告はありません</CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {cleaningRecords.map((r) => (
                  <Card key={r.id}>
                    <CardContent className="pt-4 pb-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">{fmtDate(r.date)}</span>
                            <span className="text-sm text-muted-foreground">{r.casts?.name ?? "不明"}</span>
                            {r.status === "confirmed" ? (
                              <Badge variant="secondary">確認済</Badge>
                            ) : (
                              <Badge variant="destructive">未確認</Badge>
                            )}
                          </div>
                          <div className="flex gap-3 text-xs text-muted-foreground">
                            <span className={r.room_cleaned ? "text-green-600" : "text-red-500"}>ルーム清掃 {r.room_cleaned ? "✓" : "✗"}</span>
                            <span className={r.supplies_stocked ? "text-green-600" : "text-red-500"}>備品補充 {r.supplies_stocked ? "✓" : "✗"}</span>
                            <span className={r.trash_taken_out ? "text-green-600" : "text-red-500"}>ゴミ {r.trash_taken_out ? "✓" : "✗"}</span>
                            <span className={r.equipment_checked ? "text-green-600" : "text-red-500"}>設備確認 {r.equipment_checked ? "✓" : "✗"}</span>
                          </div>
                          {r.notes && <p className="text-xs text-muted-foreground">{r.notes}</p>}
                        </div>
                        {r.status === "pending" && (
                          <Button
                            size="sm"
                            onClick={() => confirmCleaning(r.id)}
                            disabled={confirming === r.id}
                          >
                            <Check size={14} className="mr-1" />確認
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )
          ) : (
            feedbackRecords.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">確認待ちの報告はありません</CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {feedbackRecords.map((r) => (
                  <Card key={r.id}>
                    <CardContent className="pt-4 pb-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">{fmtDate(r.date)}</span>
                            <span className="text-sm text-muted-foreground">{r.casts?.name ?? "不明"}</span>
                            <span className="text-sm">{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</span>
                            {r.status === "confirmed" ? (
                              <Badge variant="secondary">確認済</Badge>
                            ) : (
                              <Badge variant="destructive">未確認</Badge>
                            )}
                          </div>
                          {r.good_points && (
                            <p className="text-xs"><span className="text-muted-foreground">良かった点：</span>{r.good_points}</p>
                          )}
                          {r.improvement_points && (
                            <p className="text-xs"><span className="text-muted-foreground">改善点：</span>{r.improvement_points}</p>
                          )}
                          {r.customer_feedback && (
                            <p className="text-xs"><span className="text-muted-foreground">お客様の声：</span>{r.customer_feedback}</p>
                          )}
                        </div>
                        {r.status === "pending" && (
                          <Button
                            size="sm"
                            onClick={() => confirmFeedback(r.id)}
                            disabled={confirming === r.id}
                          >
                            <Check size={14} className="mr-1" />確認
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )
          )}
        </div>
      </main>
    </div>
  );
}
