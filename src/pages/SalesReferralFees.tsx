import { useState, useEffect, useCallback } from "react";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/Sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfMonth, endOfMonth, subMonths, addMonths, isSameMonth } from "date-fns";
import { ja } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

interface Row {
  castId: string;
  castName: string;
  ruleName: string;
  unitAmount: number; // 予約1本あたり
  count: number;      // 完了本数
  sales: number;      // 対象売上
  fee: number;        // 紹介費 = unitAmount * count
}

const yen = (v: number) => `¥${v.toLocaleString()}`;

export default function SalesReferralFees() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(startOfMonth(new Date()));
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !user) navigate("/login");
  }, [user, authLoading, navigate]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const monthStart = format(startOfMonth(selectedMonth), "yyyy-MM-dd");
      const monthEnd = format(endOfMonth(selectedMonth), "yyyy-MM-dd");

      const [castsRes, rewardsRes, resvRes] = await Promise.all([
        supabase.from("casts").select("id, name, referral_reward_id").not("referral_reward_id", "is", null),
        supabase.from("referral_rewards").select("id, name, amount"),
        supabase
          .from("reservations")
          .select("cast_id, price, payment_fee, status, reservation_date")
          .gte("reservation_date", monthStart)
          .lte("reservation_date", monthEnd)
          .eq("status", "completed"),
      ]);

      const rewardMap = new Map<string, { name: string; amount: number }>();
      for (const r of rewardsRes.data || []) rewardMap.set(r.id, { name: r.name, amount: r.amount ?? 0 });

      // 紹介ルールが紐づくキャストのみ対象
      const targetCasts = (castsRes.data || []).filter((c: any) => c.referral_reward_id && rewardMap.has(c.referral_reward_id));
      const castInfo = new Map<string, { name: string; rule: { name: string; amount: number } }>();
      for (const c of targetCasts as any[]) {
        castInfo.set(c.id, { name: c.name, rule: rewardMap.get(c.referral_reward_id)! });
      }

      // 完了予約を対象キャストで集計
      const agg = new Map<string, { count: number; sales: number }>();
      for (const r of (resvRes.data || []) as any[]) {
        if (!r.cast_id || !castInfo.has(r.cast_id)) continue;
        const cur = agg.get(r.cast_id) ?? { count: 0, sales: 0 };
        cur.count += 1;
        cur.sales += (r.price ?? 0) + (r.payment_fee ?? 0);
        agg.set(r.cast_id, cur);
      }

      const result: Row[] = [];
      for (const [castId, info] of castInfo) {
        const a = agg.get(castId) ?? { count: 0, sales: 0 };
        if (a.count === 0) continue; // 当月実績がある紹介キャストのみ表示
        result.push({
          castId,
          castName: info.name,
          ruleName: info.rule.name,
          unitAmount: info.rule.amount,
          count: a.count,
          sales: a.sales,
          fee: info.rule.amount * a.count,
        });
      }
      result.sort((x, y) => y.fee - x.fee);
      setRows(result);
    } catch (e) {
      console.error("Error fetching referral fees:", e);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [selectedMonth]);

  useEffect(() => {
    if (user) fetchData();
  }, [user, fetchData]);

  const totalFees = rows.reduce((s, r) => s + r.fee, 0);
  const totalSales = rows.reduce((s, r) => s + r.sales, 0);
  const totalCount = rows.reduce((s, r) => s + r.count, 0);
  const isCurrentMonth = isSameMonth(selectedMonth, new Date());

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="pt-[60px] md:ml-[240px] p-6">
        <div className="max-w-5xl mx-auto">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">紹介費管理</h1>
              <p className="text-muted-foreground text-sm">セラピストを紹介してくれた会社への報酬（完了予約 × 1本単価）</p>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" onClick={() => setSelectedMonth((d) => subMonths(d, 1))}>
                <ChevronLeft size={16} />
              </Button>
              <span className="text-sm font-semibold px-3 w-28 text-center">
                {format(selectedMonth, "yyyy年M月", { locale: ja })}
              </span>
              <Button variant="outline" size="icon" onClick={() => setSelectedMonth((d) => addMonths(d, 1))} disabled={isCurrentMonth}>
                <ChevronRight size={16} />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">合計紹介費</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-bold text-primary">{yen(totalFees)}</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">対象売上</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-bold">{yen(totalSales)}</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">対象本数</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-bold">{totalCount}<span className="text-sm font-normal ml-1">本</span></div></CardContent>
            </Card>
          </div>

          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="animate-spin text-muted-foreground" /></div>
          ) : rows.length === 0 ? (
            <Card>
              <CardContent className="pt-12 pb-12 text-center text-muted-foreground text-sm">
                この月の対象データがありません。<br />
                <span className="text-xs">※「広告費」で紹介報酬ルールを作成し、キャスト管理で対象セラピストに紐付けると集計されます。</span>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/30 text-xs text-muted-foreground">
                        <th className="text-left px-4 py-2.5 font-semibold">セラピスト</th>
                        <th className="text-left px-4 py-2.5 font-semibold">紹介元ルール</th>
                        <th className="text-right px-4 py-2.5 font-semibold">完了本数</th>
                        <th className="text-right px-4 py-2.5 font-semibold">1本単価</th>
                        <th className="text-right px-4 py-2.5 font-semibold">対象売上</th>
                        <th className="text-right px-4 py-2.5 font-semibold">紹介費</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {rows.map((r) => (
                        <tr key={r.castId} className="hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-2.5 font-medium">{r.castName}</td>
                          <td className="px-4 py-2.5 text-muted-foreground">{r.ruleName}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{r.count}本</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{yen(r.unitAmount)}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{yen(r.sales)}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums font-bold text-primary">{yen(r.fee)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t bg-muted/30 font-bold">
                        <td className="px-4 py-2.5 text-xs" colSpan={2}>合計</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-xs">{totalCount}本</td>
                        <td />
                        <td className="px-4 py-2.5 text-right tabular-nums text-xs">{yen(totalSales)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-xs text-primary">{yen(totalFees)}</td>
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
