import { useState, useEffect } from "react";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/Sidebar";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO } from "date-fns";
import { ja } from "date-fns/locale";
import { ChevronDown, ChevronRight } from "lucide-react";

interface DailyRow {
  date: string;
  castName: string;
  totalSales: number;
  therapistBack: number;
  miscExpenses: number;
  accommodationFee: number;
  transportationFee: number;
  otherExpenses: number;
  payoutAmount: number;
}

interface MonthGroup {
  month: string; // "YYYY-MM"
  days: DailyRow[];
}

const yen = (v: number) => `¥${v.toLocaleString()}`;

const LABELS = [
  { key: "totalSales" as const, label: "売上", cls: "text-foreground font-semibold" },
  { key: "therapistBack" as const, label: "報酬", cls: "text-blue-600" },
  { key: "miscExpenses" as const, label: "雑費", cls: "text-orange-600" },
  { key: "accommodationFee" as const, label: "宿泊費", cls: "text-orange-600" },
  { key: "transportationFee" as const, label: "交通費", cls: "text-green-700" },
  { key: "otherExpenses" as const, label: "その他", cls: "text-rose-600" },
  { key: "payoutAmount" as const, label: "投函額", cls: "text-primary font-semibold" },
] as const;

type RowKey = typeof LABELS[number]["key"];

function sum(rows: DailyRow[], key: RowKey) {
  return rows.reduce((s, r) => s + r[key], 0);
}

export default function SalesMonthlySales() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [groups, setGroups] = useState<MonthGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !user) navigate("/login");
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) fetchData();
  }, [user]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("daily_clearances")
        .select("date, total_sales, therapist_back, misc_expenses, accommodation_fee, transportation_fee, other_expenses, payout_amount, casts(name)")
        .order("date", { ascending: false });
      if (error) throw error;

      const byMonth: Record<string, MonthGroup> = {};
      for (const row of (data || []) as any[]) {
        const month = row.date.slice(0, 7);
        if (!byMonth[month]) byMonth[month] = { month, days: [] };
        const otherTotal = (Array.isArray(row.other_expenses) ? row.other_expenses : [])
          .reduce((s: number, o: any) => s + (o?.amount ?? 0), 0);
        byMonth[month].days.push({
          date: row.date,
          castName: row.casts?.name ?? "不明",
          totalSales: row.total_sales ?? 0,
          therapistBack: row.therapist_back ?? 0,
          miscExpenses: row.misc_expenses ?? 0,
          accommodationFee: row.accommodation_fee ?? 0,
          transportationFee: row.transportation_fee ?? 0,
          otherExpenses: otherTotal,
          payoutAmount: row.payout_amount ?? 0,
        });
      }
      setGroups(Object.values(byMonth).sort((a, b) => b.month.localeCompare(a.month)));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const toggle = (month: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(month) ? next.delete(month) : next.add(month);
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="pt-[60px] md:ml-[240px] p-4">
        <div className="max-w-3xl mx-auto">
          <div className="mb-5">
            <h1 className="text-2xl font-bold">月別サマリー</h1>
            <p className="text-xs text-muted-foreground mt-1">日別精算データの月別一覧（タップで展開）</p>
          </div>

          {loading ? (
            <div className="text-center text-muted-foreground py-12">読み込み中...</div>
          ) : groups.length === 0 ? (
            <div className="text-center text-muted-foreground py-12">精算データがありません</div>
          ) : (
            <div className="space-y-2">
              {groups.map((g) => {
                const open = expanded.has(g.month);
                return (
                  <div key={g.month} className="rounded-xl border bg-card shadow-sm overflow-hidden">
                    {/* 月ヘッダー */}
                    <button
                      className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/30 transition-colors"
                      onClick={() => toggle(g.month)}
                    >
                      <span className="flex items-center gap-2">
                        {open
                          ? <ChevronDown size={16} className="text-muted-foreground flex-shrink-0" />
                          : <ChevronRight size={16} className="text-muted-foreground flex-shrink-0" />}
                        <span className="font-bold text-base">
                          {format(parseISO(`${g.month}-01`), "yyyy年M月", { locale: ja })}
                        </span>
                        <span className="text-xs text-muted-foreground">{g.days.length}件</span>
                      </span>
                      {/* 月合計チップ */}
                      <span className="text-sm font-semibold tabular-nums">
                        {yen(sum(g.days, "totalSales"))}
                      </span>
                    </button>

                    {/* 日別内訳 */}
                    {open && (
                      <div className="border-t divide-y">
                        {g.days.map((d, i) => (
                          <div key={`${d.date}-${i}`} className="px-4 py-3 bg-muted/10">
                            {/* 日付・キャスト */}
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-sm font-semibold tabular-nums">
                                {format(parseISO(d.date), "M/d(E)", { locale: ja })}
                              </span>
                              <span className="text-xs text-muted-foreground">{d.castName}</span>
                            </div>
                            {/* 金額グリッド */}
                            <div className="grid grid-cols-3 sm:grid-cols-4 gap-x-4 gap-y-1.5">
                              {LABELS.map(({ key, label, cls }) => (
                                <div key={key}>
                                  <p className="text-[10px] text-muted-foreground">{label}</p>
                                  <p className={`text-xs tabular-nums ${cls}`}>{yen(d[key])}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}

                        {/* 月合計行 */}
                        <div className="px-4 py-3 bg-muted/20">
                          <p className="text-xs font-semibold text-muted-foreground mb-2">月合計</p>
                          <div className="grid grid-cols-3 sm:grid-cols-4 gap-x-4 gap-y-1.5">
                            {LABELS.map(({ key, label, cls }) => (
                              <div key={key}>
                                <p className="text-[10px] text-muted-foreground">{label}</p>
                                <p className={`text-xs tabular-nums font-bold ${cls}`}>{yen(sum(g.days, key))}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
