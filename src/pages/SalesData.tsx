import { useState, useEffect } from "react";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/Sidebar";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, ChevronLeft, ChevronRight } from "lucide-react";

interface MonthRow {
  month: string; // "YYYY-MM"
  revenue: number;
  therapist_reward: number;
  miscellaneous: number;
  accommodation: number;
  transport: number;
}

const fmt = (n: number) => `¥${n.toLocaleString()}`;

const MONTHS_PER_PAGE = 12;

export default function SalesData() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [rows, setRows] = useState<MonthRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);

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
    const [reservRes, expRes] = await Promise.all([
      supabase
        .from("reservations" as any)
        .select("reservation_date, customer_price, therapist_back, status"),
      supabase
        .from("expenses")
        .select("expense_date, expense_type, amount"),
    ]);

    const map: Record<string, MonthRow> = {};

    const ensure = (m: string) => {
      if (!map[m]) map[m] = { month: m, revenue: 0, therapist_reward: 0, miscellaneous: 0, accommodation: 0, transport: 0 };
    };

    for (const r of (reservRes.data ?? []) as any[]) {
      if (!r.reservation_date) continue;
      if (r.status === "cancelled") continue;
      const m = r.reservation_date.slice(0, 7);
      ensure(m);
      map[m].revenue += r.customer_price ?? 0;
      map[m].therapist_reward += r.therapist_back ?? 0;
    }

    for (const e of (expRes.data ?? []) as any[]) {
      if (!e.expense_date) continue;
      const m = e.expense_date.slice(0, 7);
      ensure(m);
      const amt = e.amount ?? 0;
      if (e.expense_type === "雑費") map[m].miscellaneous += amt;
      else if (e.expense_type === "宿泊費") map[m].accommodation += amt;
      else if (e.expense_type === "交通費") map[m].transport += amt;
    }

    const sorted = Object.values(map).sort((a, b) => b.month.localeCompare(a.month));
    setRows(sorted);
    setLoading(false);
  };

  const totalPages = Math.ceil(rows.length / MONTHS_PER_PAGE);
  const visibleRows = rows.slice(page * MONTHS_PER_PAGE, (page + 1) * MONTHS_PER_PAGE);

  const totals = visibleRows.reduce(
    (acc, r) => ({
      revenue: acc.revenue + r.revenue,
      therapist_reward: acc.therapist_reward + r.therapist_reward,
      miscellaneous: acc.miscellaneous + r.miscellaneous,
      accommodation: acc.accommodation + r.accommodation,
      transport: acc.transport + r.transport,
    }),
    { revenue: 0, therapist_reward: 0, miscellaneous: 0, accommodation: 0, transport: 0 }
  );

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="pt-[60px] md:ml-[240px] p-6">
        <div className="max-w-5xl mx-auto">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">売上データ</h1>
              <p className="text-muted-foreground text-sm mt-0.5">月別集計：売上・セラピスト報酬・雑費・宿泊費・交通費</p>
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : rows.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground">データがありません</div>
          ) : (
            <>
              <div className="rounded-xl border overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/40 border-b">
                        <th className="text-left px-4 py-3 font-semibold whitespace-nowrap">月</th>
                        <th className="text-right px-4 py-3 font-semibold whitespace-nowrap">売上</th>
                        <th className="text-right px-4 py-3 font-semibold whitespace-nowrap">セラピスト報酬</th>
                        <th className="text-right px-4 py-3 font-semibold whitespace-nowrap">雑費</th>
                        <th className="text-right px-4 py-3 font-semibold whitespace-nowrap">宿泊費</th>
                        <th className="text-right px-4 py-3 font-semibold whitespace-nowrap">交通費</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {visibleRows.map((r) => {
                        const [y, m] = r.month.split("-");
                        return (
                          <tr key={r.month} className="hover:bg-muted/20 transition-colors">
                            <td className="px-4 py-3 font-medium whitespace-nowrap">
                              {y}年{parseInt(m)}月
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums text-primary font-semibold">
                              {fmt(r.revenue)}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums text-green-600">
                              {r.therapist_reward > 0 ? fmt(r.therapist_reward) : "—"}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums text-rose-500">
                              {r.miscellaneous > 0 ? fmt(r.miscellaneous) : "—"}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums text-rose-500">
                              {r.accommodation > 0 ? fmt(r.accommodation) : "—"}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums text-rose-500">
                              {r.transport > 0 ? fmt(r.transport) : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-muted/40 border-t font-semibold">
                        <td className="px-4 py-3 text-muted-foreground text-xs">
                          {totalPages > 1 ? `${page * MONTHS_PER_PAGE + 1}〜${Math.min((page + 1) * MONTHS_PER_PAGE, rows.length)}ヶ月` : "合計"}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-primary">{fmt(totals.revenue)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-green-600">{fmt(totals.therapist_reward)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-rose-500">{fmt(totals.miscellaneous)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-rose-500">{fmt(totals.accommodation)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-rose-500">{fmt(totals.transport)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-3 mt-4">
                  <button
                    onClick={() => setPage(p => p - 1)}
                    disabled={page === 0}
                    className="p-1.5 rounded border hover:bg-muted disabled:opacity-40 transition-colors"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <span className="text-sm text-muted-foreground">
                    {page + 1} / {totalPages}
                  </span>
                  <button
                    onClick={() => setPage(p => p + 1)}
                    disabled={page >= totalPages - 1}
                    className="p-1.5 rounded border hover:bg-muted disabled:opacity-40 transition-colors"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
