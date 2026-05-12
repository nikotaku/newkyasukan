import { useState, useEffect } from "react";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/Sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  subMonths,
  addMonths,
  subDays,
  addDays,
  isFuture,
  isToday,
} from "date-fns";
import { ja } from "date-fns/locale";
import { ChevronLeft, ChevronRight, CheckCircle, Lock, Loader2 } from "lucide-react";

interface Reservation {
  id: string;
  customer_name: string;
  start_time: string;
  course_name: string;
  price: number;
  status: string;
  casts: { name: string } | null;
}

interface Closing {
  id: string;
  period_type: string;
  period_date: string;
  total_sales: number;
  total_reservations: number;
  notes: string | null;
  closed_at: string;
}

export default function SalesClosing() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Daily state
  const [dailyDate, setDailyDate] = useState(new Date());
  const [dailyReservations, setDailyReservations] = useState<Reservation[]>([]);
  const [dailyClosing, setDailyClosing] = useState<Closing | null>(null);
  const [dailyNotes, setDailyNotes] = useState("");
  const [dailyLoading, setDailyLoading] = useState(false);
  const [closingDaily, setClosingDaily] = useState(false);

  // Monthly state
  const [monthlyDate, setMonthlyDate] = useState(new Date());
  const [monthlyClosing, setMonthlyClosing] = useState<Closing | null>(null);
  const [dailyClosingsInMonth, setDailyClosingsInMonth] = useState<Record<string, Closing>>({});
  const [monthlyNotes, setMonthlyNotes] = useState("");
  const [monthlyLoading, setMonthlyLoading] = useState(false);
  const [closingMonthly, setClosingMonthly] = useState(false);

  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !user) navigate("/login");
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) fetchDailyData();
  }, [user, dailyDate]);

  useEffect(() => {
    if (user) fetchMonthlyData();
  }, [user, monthlyDate]);

  const fetchDailyData = async () => {
    setDailyLoading(true);
    const dateStr = format(dailyDate, "yyyy-MM-dd");
    const [resResult, closingResult] = await Promise.all([
      supabase
        .from("reservations")
        .select("id, customer_name, start_time, course_name, price, status, casts(name)")
        .eq("reservation_date", dateStr)
        .in("status", ["confirmed", "completed"])
        .order("start_time"),
      supabase
        .from("closings" as any)
        .select("*")
        .eq("period_type", "daily")
        .eq("period_date", dateStr)
        .maybeSingle(),
    ]);
    setDailyReservations((resResult.data as any[]) || []);
    setDailyClosing(closingResult.data as Closing | null);
    setDailyNotes((closingResult.data as any)?.notes || "");
    setDailyLoading(false);
  };

  const fetchMonthlyData = async () => {
    setMonthlyLoading(true);
    const monthStr = format(monthlyDate, "yyyy-MM-dd").slice(0, 7);
    const start = format(startOfMonth(monthlyDate), "yyyy-MM-dd");
    const end = format(endOfMonth(monthlyDate), "yyyy-MM-dd");
    const [monthClosing, dayClosings] = await Promise.all([
      supabase
        .from("closings" as any)
        .select("*")
        .eq("period_type", "monthly")
        .eq("period_date", start)
        .maybeSingle(),
      supabase
        .from("closings" as any)
        .select("*")
        .eq("period_type", "daily")
        .gte("period_date", start)
        .lte("period_date", end),
    ]);
    setMonthlyClosing(monthClosing.data as Closing | null);
    setMonthlyNotes((monthClosing.data as any)?.notes || "");
    const map: Record<string, Closing> = {};
    ((dayClosings.data as any[]) || []).forEach((c: Closing) => { map[c.period_date] = c; });
    setDailyClosingsInMonth(map);
    setMonthlyLoading(false);
  };

  const handleCloseDay = async () => {
    setClosingDaily(true);
    try {
      const dateStr = format(dailyDate, "yyyy-MM-dd");
      const totalSales = dailyReservations.reduce((s, r) => s + r.price, 0);
      const { error } = await supabase.from("closings" as any).upsert(
        {
          period_type: "daily",
          period_date: dateStr,
          total_sales: totalSales,
          total_reservations: dailyReservations.length,
          notes: dailyNotes || null,
          closed_at: new Date().toISOString(),
        },
        { onConflict: "period_type,period_date" }
      );
      if (error) throw error;
      toast.success(`${format(dailyDate, "M月d日", { locale: ja })}の売上を締めました`);
      await fetchDailyData();
    } catch (e: any) {
      toast.error(`締め作業に失敗しました: ${e.message}`);
    } finally {
      setClosingDaily(false);
    }
  };

  const handleCloseMonth = async () => {
    setClosingMonthly(true);
    try {
      const start = format(startOfMonth(monthlyDate), "yyyy-MM-dd");
      const end = format(endOfMonth(monthlyDate), "yyyy-MM-dd");
      const { data: monthRes } = await supabase
        .from("reservations")
        .select("price")
        .gte("reservation_date", start)
        .lte("reservation_date", end)
        .in("status", ["confirmed", "completed"]);
      const totalSales = (monthRes || []).reduce((s: number, r: any) => s + r.price, 0);
      const { error } = await supabase.from("closings" as any).upsert(
        {
          period_type: "monthly",
          period_date: start,
          total_sales: totalSales,
          total_reservations: (monthRes || []).length,
          notes: monthlyNotes || null,
          closed_at: new Date().toISOString(),
        },
        { onConflict: "period_type,period_date" }
      );
      if (error) throw error;
      toast.success(`${format(monthlyDate, "yyyy年M月", { locale: ja })}の売上を締めました`);
      await fetchMonthlyData();
    } catch (e: any) {
      toast.error(`締め作業に失敗しました: ${e.message}`);
    } finally {
      setClosingMonthly(false);
    }
  };

  const dailyTotal = dailyReservations.reduce((s, r) => s + r.price, 0);
  const daysInMonth = eachDayOfInterval({ start: startOfMonth(monthlyDate), end: endOfMonth(monthlyDate) });
  const closedDays = daysInMonth.filter((d) => dailyClosingsInMonth[format(d, "yyyy-MM-dd")]).length;
  const pastDays = daysInMonth.filter((d) => !isFuture(d) && !isToday(d)).length + 1;

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="pt-[60px] md:ml-[240px] p-6">
        <div className="max-w-4xl mx-auto">
          <div className="mb-6">
            <h1 className="text-2xl font-bold">締め作業</h1>
            <p className="text-muted-foreground text-sm">日次・月次の売上を確定します</p>
          </div>

          <Tabs defaultValue="daily">
            <TabsList className="mb-6">
              <TabsTrigger value="daily">日次締め</TabsTrigger>
              <TabsTrigger value="monthly">月次締め</TabsTrigger>
            </TabsList>

            {/* ─── Daily ─── */}
            <TabsContent value="daily">
              <div className="flex items-center gap-3 mb-6">
                <Button variant="outline" size="icon" onClick={() => setDailyDate((d) => subDays(d, 1))}>
                  <ChevronLeft size={16} />
                </Button>
                <span className="text-base font-semibold w-36 text-center">
                  {format(dailyDate, "yyyy年M月d日(E)", { locale: ja })}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setDailyDate((d) => addDays(d, 1))}
                  disabled={isToday(dailyDate)}
                >
                  <ChevronRight size={16} />
                </Button>
              </div>

              {dailyLoading ? (
                <div className="flex justify-center py-12"><Loader2 className="animate-spin text-muted-foreground" /></div>
              ) : (
                <div className="space-y-4">
                  {dailyClosing && (
                    <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                      <Lock size={16} className="text-green-600" />
                      <span className="text-green-800 text-sm font-medium">
                        締め済み — {format(new Date(dailyClosing.closed_at), "M/d HH:mm", { locale: ja })} に確定
                        （¥{dailyClosing.total_sales.toLocaleString()} / {dailyClosing.total_reservations}件）
                      </span>
                    </div>
                  )}

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center justify-between">
                        <span>当日予約（確定・完了）</span>
                        <span className="text-lg font-bold">¥{dailyTotal.toLocaleString()}</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {dailyReservations.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-4">予約なし</p>
                      ) : (
                        <div className="space-y-2">
                          {dailyReservations.map((r) => (
                            <div key={r.id} className="flex items-center justify-between text-sm py-1.5 border-b last:border-0">
                              <div>
                                <span className="font-medium">{r.start_time.slice(0, 5)}</span>
                                <span className="mx-2 text-muted-foreground">{r.customer_name}</span>
                                <span className="text-muted-foreground">{r.casts?.name ?? "未設定"} / {r.course_name}</span>
                              </div>
                              <span className="font-semibold">¥{r.price.toLocaleString()}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <div>
                    <label className="text-sm font-medium mb-1 block">メモ</label>
                    <Textarea
                      value={dailyNotes}
                      onChange={(e) => setDailyNotes(e.target.value)}
                      placeholder="特記事項があれば入力..."
                      rows={2}
                    />
                  </div>

                  <Button
                    className="w-full"
                    size="lg"
                    onClick={handleCloseDay}
                    disabled={closingDaily || dailyReservations.length === 0}
                  >
                    {closingDaily ? (
                      <><Loader2 size={15} className="mr-2 animate-spin" />締め処理中...</>
                    ) : dailyClosing ? (
                      <><CheckCircle size={15} className="mr-2" />再締め（上書き確定）</>
                    ) : (
                      <><Lock size={15} className="mr-2" />{format(dailyDate, "M月d日", { locale: ja })}の売上を締める</>
                    )}
                  </Button>
                </div>
              )}
            </TabsContent>

            {/* ─── Monthly ─── */}
            <TabsContent value="monthly">
              <div className="flex items-center gap-3 mb-6">
                <Button variant="outline" size="icon" onClick={() => setMonthlyDate((d) => subMonths(d, 1))}>
                  <ChevronLeft size={16} />
                </Button>
                <span className="text-base font-semibold w-28 text-center">
                  {format(monthlyDate, "yyyy年M月", { locale: ja })}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setMonthlyDate((d) => addMonths(d, 1))}
                  disabled={format(monthlyDate, "yyyy-MM") >= format(new Date(), "yyyy-MM")}
                >
                  <ChevronRight size={16} />
                </Button>
              </div>

              {monthlyLoading ? (
                <div className="flex justify-center py-12"><Loader2 className="animate-spin text-muted-foreground" /></div>
              ) : (
                <div className="space-y-4">
                  {monthlyClosing && (
                    <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                      <Lock size={16} className="text-green-600" />
                      <span className="text-green-800 text-sm font-medium">
                        月次締め済み — {format(new Date(monthlyClosing.closed_at), "M/d HH:mm", { locale: ja })} に確定
                        （¥{monthlyClosing.total_sales.toLocaleString()} / {monthlyClosing.total_reservations}件）
                      </span>
                    </div>
                  )}

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center justify-between">
                        <span>日次締め状況</span>
                        <span className="text-sm text-muted-foreground">{closedDays} / {pastDays}日 締め済み</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-7 gap-1">
                        {daysInMonth.map((day) => {
                          const key = format(day, "yyyy-MM-dd");
                          const closed = !!dailyClosingsInMonth[key];
                          const future = isFuture(day) && !isToday(day);
                          return (
                            <div
                              key={key}
                              className={`text-center py-2 rounded text-xs ${
                                future
                                  ? "text-muted-foreground/40"
                                  : closed
                                  ? "bg-green-100 text-green-800 font-semibold"
                                  : "bg-orange-50 text-orange-700"
                              }`}
                            >
                              <div>{format(day, "d")}</div>
                              {!future && (
                                <div className="mt-0.5">
                                  {closed ? (
                                    <span className="text-[9px]">¥{(dailyClosingsInMonth[key].total_sales / 10000).toFixed(1)}万</span>
                                  ) : (
                                    <span className="text-[9px]">未</span>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>

                  <div>
                    <label className="text-sm font-medium mb-1 block">メモ</label>
                    <Textarea
                      value={monthlyNotes}
                      onChange={(e) => setMonthlyNotes(e.target.value)}
                      placeholder="月次特記事項があれば入力..."
                      rows={2}
                    />
                  </div>

                  <Button
                    className="w-full"
                    size="lg"
                    onClick={handleCloseMonth}
                    disabled={closingMonthly}
                  >
                    {closingMonthly ? (
                      <><Loader2 size={15} className="mr-2 animate-spin" />締め処理中...</>
                    ) : monthlyClosing ? (
                      <><CheckCircle size={15} className="mr-2" />月次再締め（上書き確定）</>
                    ) : (
                      <><Lock size={15} className="mr-2" />{format(monthlyDate, "yyyy年M月", { locale: ja })}の売上を締める</>
                    )}
                  </Button>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
}
