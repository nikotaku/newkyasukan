import { useState, useEffect } from "react";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/Sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { TrendingUp, TrendingDown, Users, Banknote, Star, Eye } from "lucide-react";

const fmt = (n: number) =>
  n >= 10000 ? `${Math.round(n / 10000)}万` : n.toLocaleString();

const pct = (a: number, b: number) =>
  b === 0 ? null : Math.round(((a - b) / b) * 100);

const ROSE = "#c49480";
const CHARCOAL = "#2a2320";

export default function Analytics() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [monthly, setMonthly] = useState<any[]>([]);
  const [therapists, setTherapists] = useState<any[]>([]);
  const [dailyAccess, setDailyAccess] = useState<any[]>([]);
  const [pageAccess, setPageAccess] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !user) navigate("/login");
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) fetchAll();
  }, [user]);

  const fetchAll = async () => {
    setLoading(true);
    const [mRes, rRes, dRes, pRes] = await Promise.all([
      supabase.from("monthly_reports").select("*").order("month_date"),
      supabase.from("reservations")
        .select("cast_id, price, status, reservation_date, casts(name)")
        .eq("status", "completed")
        .gte("reservation_date", new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10)),
      supabase.from("hp_analytics_daily").select("*").order("date", { ascending: false }).limit(30),
      supabase.from("hp_analytics_pages").select("*").order("views", { ascending: false }).limit(10),
    ]);

    if (mRes.data) {
      setMonthly(mRes.data.map((r: any) => ({
        ...r,
        month: r.month_date.slice(0, 7),
        revenue_man: Math.round((r.revenue || 0) / 10000),
        profit_man: Math.round((r.gross_profit || 0) / 10000),
        margin: r.revenue ? Math.round((r.gross_profit / r.revenue) * 100) : 0,
      })));
    }

    if (rRes.data) {
      const map: Record<string, { name: string; count: number; revenue: number }> = {};
      rRes.data.forEach((r: any) => {
        const name = r.casts?.name ?? "不明";
        if (!map[r.cast_id]) map[r.cast_id] = { name, count: 0, revenue: 0 };
        map[r.cast_id].count++;
        map[r.cast_id].revenue += r.price || 0;
      });
      setTherapists(Object.values(map).sort((a, b) => b.revenue - a.revenue).slice(0, 10));
    }

    if (dRes.data) setDailyAccess(dRes.data.reverse());
    if (pRes.data) setPageAccess(pRes.data);
    setLoading(false);
  };

  const latest = monthly[monthly.length - 1];
  const prev = monthly[monthly.length - 2];
  const totalRevenue = monthly.reduce((s, m) => s + (m.revenue || 0), 0);
  const totalProfit = monthly.reduce((s, m) => s + (m.gross_profit || 0), 0);
  const totalPV = dailyAccess.reduce((s, d) => s + (d.page_views || 0), 0);

  const Trend = ({ val }: { val: number | null }) => {
    if (val === null) return null;
    return val >= 0
      ? <span className="text-green-600 text-xs flex items-center gap-0.5"><TrendingUp size={12} />+{val}%</span>
      : <span className="text-red-500 text-xs flex items-center gap-0.5"><TrendingDown size={12} />{val}%</span>;
  };

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="pt-[60px] md:ml-[240px] p-6">
        <div className="max-w-6xl mx-auto">
          <div className="mb-6">
            <h1 className="text-2xl font-bold">アナリティクス</h1>
            <p className="text-muted-foreground">売上・顧客・セラピスト・HPアクセスの統合分析</p>
          </div>

          {loading ? (
            <div className="text-center text-muted-foreground py-12">読み込み中...</div>
          ) : (
            <Tabs defaultValue="overview">
              <TabsList className="mb-6">
                <TabsTrigger value="overview">概要</TabsTrigger>
                <TabsTrigger value="sales">売上分析</TabsTrigger>
                <TabsTrigger value="therapist">セラピスト</TabsTrigger>
                <TabsTrigger value="customer">顧客分析</TabsTrigger>
                <TabsTrigger value="access">HPアクセス</TabsTrigger>
              </TabsList>

              {/* ── 概要 ── */}
              <TabsContent value="overview" className="space-y-6">
                {/* KPI cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Card>
                    <CardContent className="pt-5">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-xs text-muted-foreground">今月売上</p>
                          <p className="text-2xl font-bold mt-1">¥{latest ? fmt(latest.revenue) : "—"}</p>
                          <Trend val={latest && prev ? pct(latest.revenue, prev.revenue) : null} />
                        </div>
                        <Banknote size={20} className="text-muted-foreground" />
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-5">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-xs text-muted-foreground">今月粗利</p>
                          <p className="text-2xl font-bold mt-1">¥{latest ? fmt(latest.gross_profit) : "—"}</p>
                          <p className="text-xs text-muted-foreground">{latest?.margin}%</p>
                        </div>
                        <TrendingUp size={20} className="text-muted-foreground" />
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-5">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-xs text-muted-foreground">今月来店数</p>
                          <p className="text-2xl font-bold mt-1">{latest?.customer_count ?? "—"}人</p>
                          <Trend val={latest && prev ? pct(latest.customer_count, prev.customer_count) : null} />
                        </div>
                        <Users size={20} className="text-muted-foreground" />
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-5">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-xs text-muted-foreground">HP PV（30日）</p>
                          <p className="text-2xl font-bold mt-1">{totalPV.toLocaleString()}</p>
                        </div>
                        <Eye size={20} className="text-muted-foreground" />
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Revenue trend */}
                <Card>
                  <CardHeader><CardTitle className="text-base">月次売上トレンド</CardTitle></CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={monthly.slice(-12)}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0e4df" />
                        <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}万`} />
                        <Tooltip formatter={(v: number) => `¥${(v * 10000).toLocaleString()}`} />
                        <Legend />
                        <Bar dataKey="revenue_man" name="売上（万円）" fill={ROSE} radius={[3, 3, 0, 0]} />
                        <Bar dataKey="profit_man" name="粗利（万円）" fill="#e8c4b4" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* Customer new vs repeat */}
                <Card>
                  <CardHeader><CardTitle className="text-base">新規 / リピーター推移</CardTitle></CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={220}>
                      <AreaChart data={monthly.slice(-12)}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0e4df" />
                        <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Legend />
                        <Area type="monotone" dataKey="new_customers" name="新規" fill="#f9d8cc" stroke={ROSE} stackId="1" />
                        <Area type="monotone" dataKey="repeat_customers" name="リピーター" fill="#ddd0cc" stroke="#a0887e" stackId="1" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* ── 売上分析 ── */}
              <TabsContent value="sales" className="space-y-6">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <Card>
                    <CardContent className="pt-5">
                      <p className="text-xs text-muted-foreground">累計売上</p>
                      <p className="text-xl font-bold mt-1">¥{totalRevenue.toLocaleString()}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-5">
                      <p className="text-xs text-muted-foreground">累計粗利</p>
                      <p className="text-xl font-bold mt-1">¥{totalProfit.toLocaleString()}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-5">
                      <p className="text-xs text-muted-foreground">平均月次売上</p>
                      <p className="text-xl font-bold mt-1">¥{monthly.length ? Math.round(totalRevenue / monthly.length).toLocaleString() : "—"}</p>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader><CardTitle className="text-base">粗利率推移</CardTitle></CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={240}>
                      <LineChart data={monthly}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0e4df" />
                        <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} domain={[0, 100]} />
                        <Tooltip formatter={(v: number) => `${v}%`} />
                        <Line type="monotone" dataKey="margin" name="粗利率" stroke={ROSE} strokeWidth={2} dot={{ r: 3 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle className="text-base">全月データ</CardTitle></CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b text-muted-foreground text-xs">
                            <th className="text-left py-2">月</th>
                            <th className="text-right py-2">売上</th>
                            <th className="text-right py-2">粗利</th>
                            <th className="text-right py-2">粗利率</th>
                            <th className="text-right py-2">来店数</th>
                            <th className="text-right py-2">新規</th>
                            <th className="text-right py-2">リピート</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[...monthly].reverse().map((m) => (
                            <tr key={m.month} className="border-b hover:bg-muted/30">
                              <td className="py-2">{m.month}</td>
                              <td className="text-right">¥{(m.revenue || 0).toLocaleString()}</td>
                              <td className="text-right">¥{(m.gross_profit || 0).toLocaleString()}</td>
                              <td className="text-right">{m.margin}%</td>
                              <td className="text-right">{m.customer_count ?? "—"}</td>
                              <td className="text-right">{m.new_customers ?? "—"}</td>
                              <td className="text-right">{m.repeat_customers ?? "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* ── セラピスト ── */}
              <TabsContent value="therapist" className="space-y-6">
                <p className="text-sm text-muted-foreground">直近90日間の完了予約から集計</p>
                {therapists.length === 0 ? (
                  <Card><CardContent className="pt-10 pb-10 text-center text-muted-foreground">データがありません</CardContent></Card>
                ) : (
                  <>
                    <Card>
                      <CardHeader><CardTitle className="text-base">セラピスト別売上（直近90日）</CardTitle></CardHeader>
                      <CardContent>
                        <ResponsiveContainer width="100%" height={280}>
                          <BarChart data={therapists} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" stroke="#f0e4df" />
                            <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 10000)}万`} />
                            <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={70} />
                            <Tooltip formatter={(v: number) => `¥${v.toLocaleString()}`} />
                            <Bar dataKey="revenue" name="売上" fill={ROSE} radius={[0, 3, 3, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader><CardTitle className="text-base">セラピスト別詳細</CardTitle></CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          {therapists.map((t, i) => (
                            <div key={t.name} className="flex items-center gap-3 py-2 border-b last:border-0">
                              <span className="w-5 text-xs text-muted-foreground font-bold">{i + 1}</span>
                              <div className="flex-1">
                                <div className="flex items-center justify-between">
                                  <span className="font-medium text-sm">{t.name}</span>
                                  <span className="font-bold text-sm">¥{t.revenue.toLocaleString()}</span>
                                </div>
                                <div className="flex items-center gap-3 mt-0.5">
                                  <span className="text-xs text-muted-foreground">{t.count}件</span>
                                  <span className="text-xs text-muted-foreground">単価 ¥{Math.round(t.revenue / t.count).toLocaleString()}</span>
                                </div>
                                <div className="mt-1 h-1.5 bg-muted rounded-full overflow-hidden">
                                  <div className="h-full rounded-full" style={{ width: `${(t.revenue / therapists[0].revenue) * 100}%`, background: ROSE }} />
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  </>
                )}
              </TabsContent>

              {/* ── 顧客分析 ── */}
              <TabsContent value="customer" className="space-y-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { label: "累計来店数", value: monthly.reduce((s, m) => s + (m.customer_count || 0), 0) + "人" },
                    { label: "累計新規", value: monthly.reduce((s, m) => s + (m.new_customers || 0), 0) + "人" },
                    { label: "累計リピーター", value: monthly.reduce((s, m) => s + (m.repeat_customers || 0), 0) + "人" },
                    {
                      label: "リピート率",
                      value: (() => {
                        const total = monthly.reduce((s, m) => s + (m.customer_count || 0), 0);
                        const repeat = monthly.reduce((s, m) => s + (m.repeat_customers || 0), 0);
                        return total ? Math.round((repeat / total) * 100) + "%" : "—";
                      })()
                    },
                  ].map(({ label, value }) => (
                    <Card key={label}>
                      <CardContent className="pt-5">
                        <p className="text-xs text-muted-foreground">{label}</p>
                        <p className="text-2xl font-bold mt-1">{value}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                <Card>
                  <CardHeader><CardTitle className="text-base">月別セッション数推移</CardTitle></CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={240}>
                      <LineChart data={monthly.slice(-12)}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0e4df" />
                        <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Legend />
                        <Line type="monotone" dataKey="session_count" name="セッション数" stroke={ROSE} strokeWidth={2} dot={{ r: 3 }} />
                        <Line type="monotone" dataKey="customer_count" name="来店人数" stroke="#a0887e" strokeWidth={2} dot={{ r: 3 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle className="text-base">新規 / リピーター比率（月別）</CardTitle></CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {[...monthly].reverse().slice(0, 12).map((m) => {
                        const total = (m.new_customers || 0) + (m.repeat_customers || 0);
                        const newPct = total ? Math.round((m.new_customers / total) * 100) : 0;
                        return (
                          <div key={m.month} className="flex items-center gap-3 text-sm">
                            <span className="w-16 text-muted-foreground text-xs">{m.month}</span>
                            <div className="flex-1 h-5 bg-muted rounded-full overflow-hidden flex">
                              <div className="h-full bg-[#c49480]" style={{ width: `${newPct}%` }} />
                              <div className="h-full bg-[#a0887e]" style={{ width: `${100 - newPct}%` }} />
                            </div>
                            <span className="text-xs text-muted-foreground w-24">新規{newPct}% / R{100 - newPct}%</span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex gap-4 mt-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm inline-block" style={{ background: ROSE }} /> 新規</span>
                      <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm inline-block bg-[#a0887e]" /> リピーター</span>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* ── HPアクセス ── */}
              <TabsContent value="access" className="space-y-6">
                {dailyAccess.length === 0 ? (
                  <Card>
                    <CardContent className="pt-10 pb-10 text-center text-muted-foreground">
                      <Eye size={32} className="mx-auto mb-3 opacity-30" />
                      <p>まだデータがありません</p>
                      <p className="text-xs mt-1">HPへのアクセスが記録されると表示されます</p>
                    </CardContent>
                  </Card>
                ) : (
                  <>
                    <div className="grid grid-cols-3 gap-4">
                      <Card><CardContent className="pt-5">
                        <p className="text-xs text-muted-foreground">30日間PV</p>
                        <p className="text-2xl font-bold mt-1">{totalPV.toLocaleString()}</p>
                      </CardContent></Card>
                      <Card><CardContent className="pt-5">
                        <p className="text-xs text-muted-foreground">日平均PV</p>
                        <p className="text-2xl font-bold mt-1">{dailyAccess.length ? Math.round(totalPV / dailyAccess.length) : 0}</p>
                      </CardContent></Card>
                      <Card><CardContent className="pt-5">
                        <p className="text-xs text-muted-foreground">最高PV（日）</p>
                        <p className="text-2xl font-bold mt-1">{Math.max(...dailyAccess.map(d => d.page_views || 0))}</p>
                      </CardContent></Card>
                    </div>

                    <Card>
                      <CardHeader><CardTitle className="text-base">日別ページビュー（直近30日）</CardTitle></CardHeader>
                      <CardContent>
                        <ResponsiveContainer width="100%" height={240}>
                          <AreaChart data={dailyAccess}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f0e4df" />
                            <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v) => v.slice(5)} />
                            <YAxis tick={{ fontSize: 11 }} />
                            <Tooltip />
                            <Area type="monotone" dataKey="page_views" name="PV" fill="#f9d8cc" stroke={ROSE} strokeWidth={2} />
                          </AreaChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader><CardTitle className="text-base">人気ページ（直近）</CardTitle></CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          {pageAccess.map((p, i) => (
                            <div key={p.page_path} className="flex items-center gap-3 text-sm">
                              <span className="w-5 text-xs text-muted-foreground">{i + 1}</span>
                              <span className="flex-1 font-mono text-xs">{p.page_path}</span>
                              <span className="font-bold">{p.views.toLocaleString()} PV</span>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  </>
                )}
              </TabsContent>
            </Tabs>
          )}
        </div>
      </main>
    </div>
  );
}
