import { useState, useEffect } from "react";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/Sidebar";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { ja } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface TherapistRow {
  id: string;
  name: string;
  photo: string | null;
  count: number;
  revenue: number;
  avg: number;
  honshimei: number; // 本指名件数
}

// 指名種別の表示順・ラベル・色
const NOMINATION_CATEGORIES = [
  { key: "本指名", label: "本指名", color: "#ec4899" },
  { key: "姫予約", label: "姫予約", color: "#a855f7" },
  { key: "ネット指名", label: "ネット指名", color: "#38bdf8" },
  { key: "指名なし", label: "指名なし / フリー", color: "#94a3b8" },
] as const;

// 本指名としてカウントする種別（セラピストを直接指名し本指名料が発生するもの）
const HONSHIMEI_TYPES = new Set(["本指名", "姫予約"]);

const normalizeNomination = (v: string | null): string => {
  if (!v || v === "none") return "指名なし";
  if (NOMINATION_CATEGORIES.some((c) => c.key === v)) return v;
  return v; // その他はそのまま表示
};

const yen = (v: number) => `¥${v.toLocaleString()}`;

export default function SalesTherapistBreakdown() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [rows, setRows] = useState<TherapistRow[]>([]);
  const [nominationBreakdown, setNominationBreakdown] = useState<{ key: string; label: string; color: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(new Date());

  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !user) navigate("/login");
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) fetchData();
  }, [user, month]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const from = format(startOfMonth(month), "yyyy-MM-dd");
      const to = format(endOfMonth(month), "yyyy-MM-dd");

      const { data, error } = await supabase
        .from("reservations")
        .select("cast_id, price, nomination_type, casts(id, name, photo)")
        .gte("reservation_date", from)
        .lte("reservation_date", to)
        .not("cast_id", "is", null)
        .neq("status", "cancelled");

      if (error) throw error;

      // Aggregate by cast
      const map = new Map<string, { name: string; photo: string | null; count: number; revenue: number; honshimei: number }>();
      // Aggregate nomination breakdown (overall)
      const nomCounts = new Map<string, number>();

      for (const r of (data || [])) {
        const cast = r.casts as any;
        const nom = normalizeNomination(r.nomination_type as string | null);
        const isHonshimei = HONSHIMEI_TYPES.has(nom);

        nomCounts.set(nom, (nomCounts.get(nom) ?? 0) + 1);

        if (!cast) continue;
        const existing = map.get(cast.id);
        if (existing) {
          existing.count += 1;
          existing.revenue += r.price ?? 0;
          if (isHonshimei) existing.honshimei += 1;
        } else {
          map.set(cast.id, { name: cast.name, photo: cast.photo, count: 1, revenue: r.price ?? 0, honshimei: isHonshimei ? 1 : 0 });
        }
      }

      const result: TherapistRow[] = Array.from(map.entries())
        .map(([id, v]) => ({
          id,
          name: v.name,
          photo: v.photo,
          count: v.count,
          revenue: v.revenue,
          avg: v.count > 0 ? Math.round(v.revenue / v.count) : 0,
          honshimei: v.honshimei,
        }))
        .sort((a, b) => b.revenue - a.revenue);

      setRows(result);

      // 既知カテゴリ＋その他をまとめる
      const known = new Set(NOMINATION_CATEGORIES.map((c) => c.key));
      const breakdown = NOMINATION_CATEGORIES.map((c) => ({
        key: c.key,
        label: c.label,
        color: c.color,
        count: nomCounts.get(c.key) ?? 0,
      }));
      let otherCount = 0;
      for (const [k, v] of nomCounts) {
        if (!known.has(k)) otherCount += v;
      }
      if (otherCount > 0) {
        breakdown.push({ key: "その他", label: "その他", color: "#cbd5e1", count: otherCount });
      }
      setNominationBreakdown(breakdown.filter((b) => b.count > 0));
    } catch (e) {
      console.error("Error fetching therapist breakdown:", e);
    } finally {
      setLoading(false);
    }
  };

  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
  const totalCount = rows.reduce((s, r) => s + r.count, 0);
  const totalHonshimei = rows.reduce((s, r) => s + r.honshimei, 0);
  const nomTotal = nominationBreakdown.reduce((s, b) => s + b.count, 0);

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="pt-[60px] md:ml-[240px] p-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold">セラピスト別売上</h1>
            {/* Month navigation */}
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setMonth(subMonths(month, 1))}>
                <ChevronLeft size={14} />
              </Button>
              <span className="text-sm font-semibold min-w-[90px] text-center">
                {format(month, "yyyy年M月", { locale: ja })}
              </span>
              <Button variant="outline" size="sm" onClick={() => setMonth(subMonths(month, -1))} disabled={format(month, "yyyy-MM") >= format(new Date(), "yyyy-MM")}>
                <ChevronRight size={14} />
              </Button>
            </div>
          </div>

          {loading ? (
            <div className="text-center text-muted-foreground py-12">読み込み中...</div>
          ) : rows.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                {format(month, "yyyy年M月", { locale: ja })}の予約データがありません
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              {/* 予約内訳（指名種別） */}
              <Card>
                <CardContent className="pt-5">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="font-semibold">予約内訳（指名種別）</h2>
                    <div className="text-sm text-muted-foreground">
                      本指名率 <span className="font-bold text-foreground">{nomTotal > 0 ? ((totalHonshimei / nomTotal) * 100).toFixed(1) : "0.0"}%</span>
                    </div>
                  </div>

                  {/* 横棒の構成比バー */}
                  <div className="flex w-full h-3 rounded-full overflow-hidden mb-4">
                    {nominationBreakdown.map((b) => (
                      <div
                        key={b.key}
                        style={{ width: nomTotal > 0 ? `${(b.count / nomTotal) * 100}%` : "0%", backgroundColor: b.color }}
                        title={`${b.label}: ${b.count}件`}
                      />
                    ))}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {nominationBreakdown.map((b) => (
                      <div key={b.key} className="rounded-lg border p-3">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: b.color }} />
                          <span className="text-xs text-muted-foreground">{b.label}</span>
                        </div>
                        <div className="text-lg font-bold tabular-nums">{b.count}<span className="text-xs font-normal text-muted-foreground ml-0.5">件</span></div>
                        <div className="text-xs text-muted-foreground tabular-nums">
                          {nomTotal > 0 ? ((b.count / nomTotal) * 100).toFixed(1) : "0.0"}%
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* セラピスト別テーブル */}
              <Card>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="border-b bg-muted/30">
                        <tr>
                          <th className="py-3 px-4 text-left font-semibold">セラピスト</th>
                          <th className="py-3 px-4 text-right font-semibold whitespace-nowrap">予約件数</th>
                          <th className="py-3 px-4 text-right font-semibold whitespace-nowrap">本指名</th>
                          <th className="py-3 px-4 text-right font-semibold whitespace-nowrap">本指名率</th>
                          <th className="py-3 px-4 text-right font-semibold whitespace-nowrap">売上</th>
                          <th className="py-3 px-4 text-right font-semibold whitespace-nowrap">平均単価</th>
                          <th className="py-3 px-4 text-right font-semibold whitespace-nowrap">構成比</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row) => {
                          const rate = row.count > 0 ? (row.honshimei / row.count) * 100 : 0;
                          return (
                            <tr key={row.id} className="border-b hover:bg-muted/30 transition-colors">
                              <td className="py-3 px-4">
                                <div className="flex items-center gap-2">
                                  <div className="w-7 h-7 rounded-full overflow-hidden bg-muted shrink-0">
                                    {row.photo ? (
                                      <img src={row.photo} alt={row.name} className="w-full h-full object-cover" />
                                    ) : (
                                      <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">
                                        {row.name.charAt(0)}
                                      </div>
                                    )}
                                  </div>
                                  <span className="font-medium">{row.name}</span>
                                </div>
                              </td>
                              <td className="py-3 px-4 text-right tabular-nums">{row.count}件</td>
                              <td className="py-3 px-4 text-right tabular-nums">{row.honshimei}件</td>
                              <td className="py-3 px-4 text-right tabular-nums">
                                <div className="flex items-center justify-end gap-2">
                                  <span className={rate >= 50 ? "font-semibold text-pink-600" : "text-muted-foreground"}>
                                    {rate.toFixed(1)}%
                                  </span>
                                  <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
                                    <div className="h-full bg-pink-500 rounded-full" style={{ width: `${rate}%` }} />
                                  </div>
                                </div>
                              </td>
                              <td className="py-3 px-4 text-right tabular-nums font-medium">{yen(row.revenue)}</td>
                              <td className="py-3 px-4 text-right tabular-nums text-muted-foreground">{yen(row.avg)}</td>
                              <td className="py-3 px-4 text-right tabular-nums">
                                <div className="flex items-center justify-end gap-2">
                                  <span className="text-muted-foreground">
                                    {totalRevenue > 0 ? ((row.revenue / totalRevenue) * 100).toFixed(1) : "0.0"}%
                                  </span>
                                  <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                                    <div
                                      className="h-full bg-primary rounded-full"
                                      style={{ width: totalRevenue > 0 ? `${(row.revenue / totalRevenue) * 100}%` : "0%" }}
                                    />
                                  </div>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot className="border-t bg-muted/20">
                        <tr>
                          <td className="py-3 px-4 font-semibold">合計</td>
                          <td className="py-3 px-4 text-right tabular-nums font-semibold">{totalCount}件</td>
                          <td className="py-3 px-4 text-right tabular-nums font-semibold">{totalHonshimei}件</td>
                          <td className="py-3 px-4 text-right tabular-nums font-semibold">
                            {totalCount > 0 ? ((totalHonshimei / totalCount) * 100).toFixed(1) : "0.0"}%
                          </td>
                          <td className="py-3 px-4 text-right tabular-nums font-semibold">{yen(totalRevenue)}</td>
                          <td className="py-3 px-4 text-right tabular-nums text-muted-foreground">
                            {totalCount > 0 ? yen(Math.round(totalRevenue / totalCount)) : "—"}
                          </td>
                          <td />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
