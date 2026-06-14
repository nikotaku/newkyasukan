import { useState, useEffect } from "react";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/Sidebar";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO } from "date-fns";
import { ja } from "date-fns/locale";

interface MonthlySummary {
  month: string;
  totalSales: number;       // 予約DBから（日別精算と同じ計算）
  therapistBack: number;
  miscExpenses: number;
  accommodationFee: number;
  transportationFee: number;
  otherExpenses: number;
  payoutAmount: number;
  recordCount: number;
}

const yen = (v: number) => (v === 0 ? "¥0" : `¥${v.toLocaleString()}`);

export default function SalesMonthlySales() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [summaries, setSummaries] = useState<MonthlySummary[]>([]);
  const [loading, setLoading] = useState(true);

  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !user) navigate("/login");
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) fetchSummaries();
  }, [user]);

  const fetchSummaries = async () => {
    setLoading(true);
    try {
      // 売上: 予約DBから（キャンセル以外、日別精算と同じソース）
      const [resResult, dcResult] = await Promise.all([
        supabase
          .from("reservations")
          .select("reservation_date, price, payment_fee")
          .eq("store_id", "00000000-0000-0000-0000-000000000001")
          .neq("status", "cancelled"),
        supabase
          .from("daily_clearances")
          .select("date, therapist_back, misc_expenses, accommodation_fee, transportation_fee, other_expenses, payout_amount")
          .order("date", { ascending: false }),
      ]);

      const byMonth: Record<string, MonthlySummary> = {};

      const ensure = (month: string) => {
        if (!byMonth[month]) {
          byMonth[month] = {
            month,
            totalSales: 0,
            therapistBack: 0,
            miscExpenses: 0,
            accommodationFee: 0,
            transportationFee: 0,
            otherExpenses: 0,
            payoutAmount: 0,
            recordCount: 0,
          };
        }
        return byMonth[month];
      };

      // 予約から売上を月別集計
      for (const r of resResult.data || []) {
        const month = r.reservation_date.slice(0, 7);
        ensure(month).totalSales += (r.price ?? 0) + (r.payment_fee ?? 0);
      }

      // daily_clearancesから費用を月別集計
      for (const row of dcResult.data || []) {
        const month = row.date.slice(0, 7);
        const m = ensure(month);
        m.therapistBack += row.therapist_back ?? 0;
        m.miscExpenses += row.misc_expenses ?? 0;
        m.accommodationFee += row.accommodation_fee ?? 0;
        m.transportationFee += row.transportation_fee ?? 0;
        m.payoutAmount += row.payout_amount ?? 0;
        m.recordCount += 1;
        const others = Array.isArray(row.other_expenses) ? row.other_expenses : [];
        for (const o of others as { amount?: number }[]) {
          m.otherExpenses += o.amount ?? 0;
        }
      }

      setSummaries(
        Object.values(byMonth).sort((a, b) => b.month.localeCompare(a.month))
      );
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const totals = summaries.reduce(
    (acc, s) => ({
      totalSales: acc.totalSales + s.totalSales,
      therapistBack: acc.therapistBack + s.therapistBack,
      miscExpenses: acc.miscExpenses + s.miscExpenses,
      accommodationFee: acc.accommodationFee + s.accommodationFee,
      transportationFee: acc.transportationFee + s.transportationFee,
      otherExpenses: acc.otherExpenses + s.otherExpenses,
      payoutAmount: acc.payoutAmount + s.payoutAmount,
    }),
    { totalSales: 0, therapistBack: 0, miscExpenses: 0, accommodationFee: 0, transportationFee: 0, otherExpenses: 0, payoutAmount: 0 }
  );

  const cols = [
    { key: "totalSales" as const, label: "売上", className: "font-semibold" },
    { key: "therapistBack" as const, label: "報酬", className: "text-blue-600" },
    { key: "miscExpenses" as const, label: "雑費", className: "text-orange-600" },
    { key: "accommodationFee" as const, label: "宿泊費", className: "text-orange-600" },
    { key: "transportationFee" as const, label: "交通費", className: "text-green-700" },
    { key: "otherExpenses" as const, label: "その他", className: "text-rose-600" },
    { key: "payoutAmount" as const, label: "投函額", className: "text-primary font-semibold" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="pt-[60px] md:ml-[240px] p-6">
        <div className="max-w-7xl mx-auto">
          <div className="mb-6">
            <h1 className="text-2xl font-bold">月別サマリー</h1>
            <p className="text-sm text-muted-foreground mt-1">日別精算データの月別集計</p>
          </div>

          {loading ? (
            <div className="text-center text-muted-foreground py-12">読み込み中...</div>
          ) : summaries.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                データがありません
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b bg-muted/30">
                      <tr>
                        <th className="py-3 px-4 text-left font-semibold whitespace-nowrap">月</th>
                        {cols.map((c) => (
                          <th key={c.key} className="py-3 px-4 text-right font-semibold whitespace-nowrap">
                            {c.label}
                          </th>
                        ))}
                        <th className="py-3 px-4 text-right font-semibold whitespace-nowrap text-muted-foreground">件数</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summaries.map((s) => (
                        <tr key={s.month} className="border-b hover:bg-muted/30 transition-colors">
                          <td className="py-3 px-4 font-semibold whitespace-nowrap">
                            {format(parseISO(`${s.month}-01`), "yyyy年M月", { locale: ja })}
                          </td>
                          {cols.map((c) => (
                            <td key={c.key} className={`py-3 px-4 tabular-nums text-right whitespace-nowrap ${c.className}`}>
                              {yen(s[c.key])}
                            </td>
                          ))}
                          <td className="py-3 px-4 text-right text-muted-foreground tabular-nums">
                            {s.recordCount}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="border-t-2 border-border bg-muted/20">
                      <tr>
                        <td className="py-3 px-4 font-bold">合計</td>
                        {cols.map((c) => (
                          <td key={c.key} className={`py-3 px-4 tabular-nums text-right whitespace-nowrap font-bold ${c.className}`}>
                            {yen(totals[c.key])}
                          </td>
                        ))}
                        <td className="py-3 px-4 text-right text-muted-foreground font-bold">
                          {summaries.reduce((s, r) => s + r.recordCount, 0)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}
