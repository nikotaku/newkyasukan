import { useState, useEffect, useCallback } from "react";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/Sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { format, subDays, addDays, isToday } from "date-fns";
import { ja } from "date-fns/locale";
import { ChevronLeft, ChevronRight, CheckCircle, Loader2, CreditCard } from "lucide-react";
import { toast } from "sonner";

interface Reservation {
  id: string;
  customer_name: string;
  start_time: string;
  course_name: string;
  price: number;
  status: string;
  course_type: string | null;
  duration: number | null;
  cast_id: string | null;
  options: string[] | null;
  casts: { id: string; name: string } | null;
}

interface CastGroup {
  castId: string;
  castName: string;
  reservations: Reservation[];
  totalSales: number;
  autoBack: number;
}

interface Clearance {
  id: string;
  cast_id: string;
  therapist_back: number;
  misc_expenses: number;
  accommodation_fee: number;
  payout_amount: number;
  payout_method: string | null;
  status: string;
  cleared_at: string | null;
}

interface ClearanceInput {
  therapistBack: number;
  miscExpenses: number;
  accommodationFee: number;
  payoutMethod: string;
  submitting: boolean;
}

const yen = (v: number) => v === 0 ? "¥0" : `¥${v.toLocaleString()}`;

export default function SalesDailySales() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [castGroups, setCastGroups] = useState<CastGroup[]>([]);
  const [clearances, setClearances] = useState<Record<string, Clearance>>({});
  const [clearanceInputs, setClearanceInputs] = useState<Record<string, ClearanceInput>>({});
  const [loading, setLoading] = useState(true);

  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !user) navigate("/login");
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) fetchDay();
  }, [user, selectedDate]);

  const fetchDay = useCallback(async () => {
    setLoading(true);
    const dateStr = format(selectedDate, "yyyy-MM-dd");
    try {
      const [resResult, backRatesResult, optionRatesResult, clearResult] = await Promise.all([
        supabase
          .from("reservations")
          .select("id, customer_name, start_time, course_name, price, status, course_type, duration, cast_id, options, casts(id, name)")
          .eq("reservation_date", dateStr)
          .in("status", ["confirmed", "completed"])
          .order("start_time"),
        supabase.from("back_rates").select("course_type, duration, therapist_back"),
        supabase.from("option_rates").select("option_name, therapist_back"),
        supabase
          .from("daily_clearances" as any)
          .select("*")
          .eq("date", dateStr),
      ]);

      const brMap: Record<string, number> = {};
      for (const br of backRatesResult.data || []) {
        brMap[`${br.course_type}_${br.duration}`] = br.therapist_back ?? 0;
      }
      const optMap: Record<string, number> = {};
      for (const or of optionRatesResult.data || []) {
        optMap[or.option_name] = or.therapist_back ?? 0;
      }

      const groups: Record<string, CastGroup> = {};
      for (const r of (resResult.data as Reservation[]) || []) {
        if (!r.cast_id) continue;
        const castId = r.cast_id;
        const castName = r.casts?.name ?? "未設定";
        if (!groups[castId]) {
          groups[castId] = { castId, castName, reservations: [], totalSales: 0, autoBack: 0 };
        }
        groups[castId].reservations.push(r);
        groups[castId].totalSales += r.price ?? 0;
        groups[castId].autoBack += brMap[`${r.course_type}_${r.duration}`] ?? 0;
        for (const opt of r.options ?? []) {
          groups[castId].autoBack += optMap[opt] ?? 0;
        }
      }

      const groupList = Object.values(groups).sort((a, b) => a.castName.localeCompare(b.castName));
      setCastGroups(groupList);

      const clearMap: Record<string, Clearance> = {};
      for (const c of (clearResult.data as Clearance[]) || []) clearMap[c.cast_id] = c;
      setClearances(clearMap);

      const inputs: Record<string, ClearanceInput> = {};
      for (const g of groupList) {
        const ex = clearMap[g.castId];
        inputs[g.castId] = {
          therapistBack: ex?.therapist_back ?? g.autoBack,
          miscExpenses: ex?.misc_expenses ?? 0,
          accommodationFee: ex?.accommodation_fee ?? 0,
          payoutMethod: ex?.payout_method ?? "",
          submitting: false,
        };
      }
      setClearanceInputs(inputs);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  const updateInput = (castId: string, field: keyof ClearanceInput, value: any) => {
    setClearanceInputs((prev) => ({ ...prev, [castId]: { ...prev[castId], [field]: value } }));
  };

  const handleClear = async (group: CastGroup) => {
    const input = clearanceInputs[group.castId];
    if (!input) return;
    updateInput(group.castId, "submitting", true);
    const dateStr = format(selectedDate, "yyyy-MM-dd");
    const payout = input.therapistBack - input.miscExpenses - input.accommodationFee;
    try {
      const { error } = await supabase.from("daily_clearances" as any).upsert(
        {
          cast_id: group.castId,
          date: dateStr,
          total_sales: group.totalSales,
          therapist_back: input.therapistBack,
          misc_expenses: input.miscExpenses,
          accommodation_fee: input.accommodationFee,
          payout_amount: payout,
          payout_method: input.payoutMethod || null,
          status: "pending",
          points_awarded: 0.5,
          cleared_at: new Date().toISOString(),
        },
        { onConflict: "cast_id,date" }
      );
      if (error) throw error;

      if (!clearances[group.castId]) {
        await supabase.rpc("increment_cast_points" as any, {
          p_cast_id: group.castId,
          p_points: 0.5,
        }).catch(() => {});
      }

      toast.success(`${group.castName} の清算が完了しました`);
      const { data } = await supabase.from("daily_clearances" as any).select("*").eq("date", dateStr);
      const clearMap: Record<string, Clearance> = {};
      for (const c of (data as Clearance[]) || []) clearMap[c.cast_id] = c;
      setClearances(clearMap);
    } catch (e: any) {
      toast.error(`清算に失敗しました: ${e?.message ?? "不明なエラー"}`);
    } finally {
      updateInput(group.castId, "submitting", false);
    }
  };

  const dateStr = format(selectedDate, "yyyy-MM-dd");
  const allCleared = castGroups.length > 0 && castGroups.every((g) => clearances[g.castId]);

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="pt-[60px] md:ml-[240px] p-6">
        <div className="max-w-3xl mx-auto">
          {/* Header with date nav */}
          <div className="mb-6 flex items-center justify-between">
            <h1 className="text-2xl font-bold">日別清算</h1>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" onClick={() => setSelectedDate((d) => subDays(d, 1))}>
                <ChevronLeft size={16} />
              </Button>
              <span className="text-sm font-semibold px-3 w-44 text-center">
                {format(selectedDate, "yyyy年M月d日(E)", { locale: ja })}
                {isToday(selectedDate) && <span className="ml-1 text-xs text-primary">今日</span>}
              </span>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setSelectedDate((d) => addDays(d, 1))}
                disabled={isToday(selectedDate)}
              >
                <ChevronRight size={16} />
              </Button>
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="animate-spin text-muted-foreground" /></div>
          ) : castGroups.length === 0 ? (
            <Card>
              <CardContent className="py-16 text-center text-muted-foreground">
                この日の予約がありません
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {allCleared && (
                <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800 font-medium">
                  <CheckCircle size={14} className="text-green-600" />
                  全員の清算が完了しています
                </div>
              )}

              {castGroups.map((g) => {
                const input = clearanceInputs[g.castId] ?? { therapistBack: 0, miscExpenses: 0, accommodationFee: 0, payoutMethod: "", submitting: false };
                const cleared = clearances[g.castId];
                const payout = input.therapistBack - input.miscExpenses - input.accommodationFee;

                return (
                  <Card key={g.castId} className={cleared ? "border-green-200" : "border-primary/20"}>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center justify-between">
                        <span className="flex items-center gap-2">
                          <CreditCard size={15} className="text-primary" />
                          {g.castName}
                        </span>
                        {cleared ? (
                          <Badge className="bg-green-100 text-green-700 text-xs border-0">
                            <CheckCircle size={10} className="mr-1" />清算済み
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-orange-600 border-orange-300 text-xs">未清算</Badge>
                        )}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Reservations */}
                      <div className="border rounded-md divide-y text-sm">
                        {g.reservations.map((r) => (
                          <div key={r.id} className="flex items-center justify-between px-3 py-2">
                            <div className="flex items-center gap-3">
                              <span className="font-medium tabular-nums text-xs w-10">{r.start_time.slice(11, 16)}</span>
                              <span>{r.customer_name}</span>
                              <span className="text-muted-foreground text-xs">{r.course_name}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                                r.status === "completed" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"
                              }`}>
                                {r.status === "completed" ? "完了" : "確定"}
                              </span>
                              <span className="font-semibold tabular-nums text-xs">¥{r.price.toLocaleString()}</span>
                            </div>
                          </div>
                        ))}
                        <div className="flex justify-between px-3 py-2 bg-muted/30 font-semibold text-sm">
                          <span>売上合計</span>
                          <span>{yen(g.totalSales)}</span>
                        </div>
                      </div>

                      {/* Inputs */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label className="text-xs mb-1 block">バック（円）</Label>
                          <Input
                            type="number"
                            min="0"
                            inputMode="numeric"
                            placeholder="0"
                            value={input.therapistBack === 0 ? "" : input.therapistBack}
                            onChange={(e) => updateInput(g.castId, "therapistBack", Number(e.target.value) || 0)}
                          />
                          {g.autoBack > 0 && input.therapistBack === g.autoBack && (
                            <p className="text-[10px] text-muted-foreground mt-0.5">バック表より自動入力</p>
                          )}
                        </div>
                        <div>
                          <Label className="text-xs mb-1 block">雑費（円）</Label>
                          <Input
                            type="number"
                            min="0"
                            inputMode="numeric"
                            placeholder="0"
                            value={input.miscExpenses === 0 ? "" : input.miscExpenses}
                            onChange={(e) => updateInput(g.castId, "miscExpenses", Number(e.target.value) || 0)}
                          />
                        </div>
                        <div>
                          <Label className="text-xs mb-1 block">宿泊費（円）</Label>
                          <Input
                            type="number"
                            min="0"
                            inputMode="numeric"
                            placeholder="0"
                            value={input.accommodationFee === 0 ? "" : input.accommodationFee}
                            onChange={(e) => updateInput(g.castId, "accommodationFee", Number(e.target.value) || 0)}
                          />
                        </div>
                        <div className="flex items-end">
                          <div className="w-full p-3 bg-primary/5 rounded-md text-center">
                            <p className="text-xs text-muted-foreground">投函金額</p>
                            <p className="text-lg font-bold text-primary">{yen(payout)}</p>
                          </div>
                        </div>
                      </div>

                      <div>
                        <Label className="text-xs mb-1 block">投函方法・アナウンス</Label>
                        <Textarea
                          value={input.payoutMethod}
                          onChange={(e) => updateInput(g.castId, "payoutMethod", e.target.value)}
                          placeholder="例：〇〇ルームの引き出しに入れています"
                          rows={2}
                        />
                      </div>

                      <Button
                        className="w-full"
                        onClick={() => handleClear(g)}
                        disabled={input.submitting}
                      >
                        {input.submitting ? (
                          <><Loader2 size={14} className="mr-2 animate-spin" />処理中...</>
                        ) : cleared ? (
                          <><CheckCircle size={14} className="mr-2" />再清算（上書き）</>
                        ) : (
                          <><CreditCard size={14} className="mr-2" />{g.castName} を清算する</>
                        )}
                      </Button>

                      {cleared && (
                        <p className="text-xs text-center text-muted-foreground">
                          {format(new Date(cleared.cleared_at!), "M/d HH:mm")} に清算済み · 投函金額 {yen(cleared.payout_amount)}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
