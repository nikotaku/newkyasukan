import { useState, useEffect, useMemo } from "react";
import { format, addDays, subDays, parse, addMinutes, startOfMonth, endOfMonth } from "date-fns";
import { ja } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Plus, TrendingUp, Calendar as CalendarIcon, X, Pencil, Check, Copy } from "lucide-react";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/Sidebar";
import { TabMenu } from "@/components/TabMenu";
import { DailyReservationTimeline } from "@/components/DailyReservationTimeline";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ReservationForm } from "@/components/ReservationForm";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface Cast {
  id: string;
  name: string;
  photo: string | null;
}

interface Shift {
  id: string;
  cast_id: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  room: string | null;
}

interface Reservation {
  id: string;
  cast_id: string;
  reservation_date: string;
  start_time: string;
  duration: number;
  customer_name: string;
  customer_phone: string;
  course_name: string;
  course_type: string | null;
  nomination_type: string | null;
  price: number;
  status: string;
  payment_status: string;
  room: string | null;
  notes: string | null;
}

const TIME_START = 10;
const TIME_END = 26;
const HOUR_HEIGHT = 80; // px per hour (vertical)
const TIME_LABEL_W = 48;

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-100 border-amber-400 text-amber-900",
  sms_waiting: "bg-purple-100 border-purple-400 text-purple-900",
  confirmed: "bg-blue-100 border-blue-400 text-blue-900",
  completed: "bg-emerald-100 border-emerald-400 text-emerald-900",
  cancelled: "bg-rose-100 border-rose-300 text-rose-700 opacity-50",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "確認中",
  sms_waiting: "SMS送信待ち",
  confirmed: "確定",
  completed: "完了",
  cancelled: "キャンセル",
};

const TOTAL_HEIGHT = (TIME_END - TIME_START) * HOUR_HEIGHT;

function timeToMinutes(time: string) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function minutesToPx(minutes: number) {
  return ((minutes - TIME_START * 60) / 60) * HOUR_HEIGHT;
}

export default function Schedule() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedView, setSelectedView] = useState<"cast" | "room">("cast");
  const [shifts, setShifts] = useState<(Shift & { cast: Cast })[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [monthlyTotal, setMonthlyTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isAddOpen, setIsAddOpen] = useState(false);

  // Detail/Edit sheet
  const [detailRes, setDetailRes] = useState<Reservation | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editFields, setEditFields] = useState<Partial<Reservation>>({});

  const { user, loading: authLoading, isAdmin } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    cast_id: "",
    customer_name: "",
    customer_phone: "",
    customer_email: "",
    nomination_type: "none",
    reservation_date: new Date(),
    start_time: "14:00",
    end_time: "15:00",
    duration: 80,
    room: "",
    course_type: "aroma",
    course_name: "80分 アロマオイルコース",
    selectedOptions: [] as string[],
    discount_id: "none",
    discount: 0,
    price: 12000,
    payment_method: "cash",
    reservation_method: "",
    notes: "",
  });

  const [casts, setCasts] = useState<{ id: string; name: string }[]>([]);
  const [rooms, setRooms] = useState<{ id: string; name: string; address: string | null }[]>([]);
  const [backRates, setBackRates] = useState<any[]>([]);
  const [optionRates, setOptionRates] = useState<any[]>([]);
  const [nominationRates, setNominationRates] = useState<any[]>([]);
  const [discounts, setDiscounts] = useState<{ id: string; name: string; discount_type: "fixed" | "percentage"; discount_value: number }[]>([]);

  useEffect(() => {
    if (!authLoading && !user) navigate("/login");
  }, [user, authLoading]);

  useEffect(() => {
    if (user) {
      fetchData();
      fetchFormData();
    }
  }, [user, selectedDate]);

  const fetchFormData = async () => {
    const [{ data: c }, { data: r }, { data: b }, { data: o }, { data: n }, { data: d }] = await Promise.all([
      supabase.from("casts").select("id, name").order("name"),
      supabase.from("rooms").select("id, name, address").eq("is_active", true).order("name"),
      supabase.from("back_rates").select("*"),
      supabase.from("option_rates").select("*"),
      supabase.from("nomination_rates").select("*"),
      supabase.from("discounts").select("id, name, discount_type, discount_value, is_active").eq("is_active", true).order("name"),
    ]);
    if (c) setCasts(c);
    if (r) setRooms(r);
    if (b) setBackRates(b);
    if (o) setOptionRates(o);
    if (n) setNominationRates(n);
    if (d) setDiscounts(d as any);
  };

  const fetchData = async () => {
    setLoading(true);
    const dateStr = format(selectedDate, "yyyy-MM-dd");
    const monthStart = format(startOfMonth(selectedDate), "yyyy-MM-dd");
    const monthEnd = format(endOfMonth(selectedDate), "yyyy-MM-dd");

    const [{ data: shiftsData }, { data: reservationsData }, { data: monthData }] = await Promise.all([
      supabase.from("shifts").select("*, cast:casts(id, name, photo)").eq("shift_date", dateStr),
      supabase.from("reservations").select("*").eq("reservation_date", dateStr).neq("status", "cancelled"),
      supabase.from("reservations").select("price").gte("reservation_date", monthStart).lte("reservation_date", monthEnd).neq("status", "cancelled"),
    ]);

    setShifts((shiftsData as any) || []);
    setReservations(reservationsData || []);
    setMonthlyTotal((monthData || []).reduce((sum, r: any) => sum + (r.price || 0), 0));
    setLoading(false);
  };

  const dailyTotal = useMemo(() => reservations.reduce((sum, r) => sum + (r.price || 0), 0), [reservations]);

  const castRows = useMemo(() => {
    const map = new Map<string, { cast: Cast; shift: Shift & { cast: Cast }; reservations: Reservation[] }>();
    shifts.forEach((s) => {
      if (!map.has(s.cast_id)) map.set(s.cast_id, { cast: s.cast, shift: s, reservations: [] });
    });
    reservations.forEach((r) => {
      const row = map.get(r.cast_id);
      if (row) row.reservations.push(r);
    });
    return Array.from(map.values());
  }, [shifts, reservations]);

  const hours = Array.from({ length: TIME_END - TIME_START }, (_, i) => TIME_START + i);

  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const isToday = format(selectedDate, "yyyy-MM-dd") === format(now, "yyyy-MM-dd");
  const nowPx = minutesToPx(nowMinutes);

  const handleTimelineClick = (castId: string, clickY: number) => {
    if (!isAdmin) return;
    const totalMin = TIME_START * 60 + (clickY / HOUR_HEIGHT) * 60;
    const snapped = Math.floor(totalMin / 10) * 10;
    const h = Math.floor(snapped / 60);
    const m = snapped % 60;
    const timeStr = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    setFormData((prev) => ({ ...prev, cast_id: castId, reservation_date: selectedDate, start_time: timeStr }));
    setIsAddOpen(true);
  };

  const handleAddReservation = async () => {
    if (!isAdmin || !user) return;
    try {
      const { error } = await supabase.from("reservations").insert([{
        cast_id: formData.cast_id,
        customer_name: formData.customer_name,
        customer_phone: formData.customer_phone,
        customer_email: formData.customer_email || null,
        reservation_date: format(formData.reservation_date, "yyyy-MM-dd"),
        start_time: formData.start_time,
        duration: formData.duration,
        course_type: formData.course_type,
        course_name: formData.course_name,
        options: formData.selectedOptions,
        nomination_type: formData.nomination_type === "none" ? null : formData.nomination_type,
        price: formData.price,
        discount: formData.discount || 0,
        notes: formData.notes || null,
        room: formData.room || null,
        created_by: user.id,
      }]);
      if (error) throw error;
      toast({ title: "予約追加", description: "新しい予約が追加されました" });
      setIsAddOpen(false);
      fetchData();
    } catch {
      toast({ title: "エラー", description: "予約の追加に失敗しました", variant: "destructive" });
    }
  };

  const openDetail = (res: Reservation) => {
    setDetailRes(res);
    setEditFields({
      customer_name: res.customer_name,
      customer_phone: res.customer_phone,
      course_name: res.course_name,
      start_time: res.start_time.slice(0, 5),
      duration: res.duration,
      price: res.price,
      status: res.status,
      notes: res.notes ?? "",
    });
    setEditMode(false);
  };

  const handleSaveEdit = async () => {
    if (!detailRes) return;
    try {
      const { error } = await supabase.from("reservations").update({
        customer_name: editFields.customer_name,
        customer_phone: editFields.customer_phone,
        course_name: editFields.course_name,
        start_time: editFields.start_time,
        duration: Number(editFields.duration),
        price: Number(editFields.price),
        status: editFields.status,
        notes: editFields.notes || null,
      }).eq("id", detailRes.id);
      if (error) throw error;
      toast({ title: "更新しました" });
      setEditMode(false);
      setDetailRes(null);
      fetchData();
    } catch {
      toast({ title: "エラー", description: "更新に失敗しました", variant: "destructive" });
    }
  };

  const handleDeleteReservation = async () => {
    if (!detailRes || !confirm("この予約をキャンセルしますか？")) return;
    try {
      const { error } = await supabase.from("reservations").update({ status: "cancelled" }).eq("id", detailRes.id);
      if (error) throw error;
      toast({ title: "キャンセルしました" });
      setDetailRes(null);
      fetchData();
    } catch {
      toast({ title: "エラー", description: "キャンセルに失敗しました", variant: "destructive" });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="pt-[60px] md:ml-[180px] transition-all duration-300">
        <div className="p-3 md:p-4">
          {/* Header */}
          <div className="space-y-2 mb-2">
            {/* Row 1: date navigation */}
            <div className="flex items-center justify-center gap-1 flex-wrap">
              <Button variant="outline" size="icon" onClick={() => setSelectedDate(subDays(selectedDate, 1))}>
                <ChevronLeft size={18} />
              </Button>
              <h1 className="text-base font-bold px-2 min-w-[120px] text-center">
                {format(selectedDate, "M月d日 (E)", { locale: ja })}
              </h1>
              <Button variant="outline" size="icon" onClick={() => setSelectedDate(addDays(selectedDate, 1))}>
                <ChevronRight size={18} />
              </Button>
              <Button variant="outline" size="sm" onClick={() => setSelectedDate(new Date())}>今日</Button>
            </div>
            {/* Row 2: view toggle + add */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-1">
                <Button size="sm" variant={selectedView === "cast" ? "default" : "outline"} onClick={() => setSelectedView("cast")}>キャスト別</Button>
                <Button size="sm" variant={selectedView === "room" ? "default" : "outline"} onClick={() => setSelectedView("room")}>ルーム別</Button>
              </div>
              <Sheet open={isAddOpen} onOpenChange={setIsAddOpen}>
                <SheetTrigger asChild>
                  <Button size="sm" className="bg-[#c49480] hover:bg-[#a87b65]">
                    <Plus size={16} className="mr-1" />新規予約
                  </Button>
                </SheetTrigger>
                <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
                  <SheetHeader><SheetTitle>新しい予約を追加</SheetTitle></SheetHeader>
                  <div className="mt-6">
                    <ReservationForm
                      formData={formData}
                      setFormData={setFormData}
                      casts={casts}
                      rooms={rooms}
                      backRates={backRates}
                      optionRates={optionRates}
                      nominationRates={nominationRates}
                      discounts={discounts}
                      onSubmit={handleAddReservation}
                    />
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>

          {/* Week tabs */}
          <TabMenu
            activeDate={format(selectedDate, "yyyy-MM-dd")}
            dates={Array.from({ length: 7 }, (_, i) => {
              const d = addDays(new Date(new Date().setHours(0, 0, 0, 0)), i - 1);
              return { date: format(d, "yyyy-MM-dd"), label: format(d, "M/d(E)", { locale: ja }) };
            })}
            onDateChange={(dateStr) => setSelectedDate(new Date(dateStr))}
          />

          {selectedView === "room" && (
            <div className="mb-4"><DailyReservationTimeline /></div>
          )}

          {selectedView === "cast" && (
            <>
              {/* Sales summary */}
              <div className="grid grid-cols-2 gap-2 mb-3">
                <Card className="p-3 flex items-center gap-2">
                  <TrendingUp size={16} className="text-primary flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[10px] text-muted-foreground">本日の売上</div>
                    <div className="text-base font-bold truncate">¥{dailyTotal.toLocaleString()}</div>
                    <div className="text-[10px] text-muted-foreground">{reservations.length}件の予約</div>
                  </div>
                </Card>
                <Card className="p-3 flex items-center gap-2">
                  <CalendarIcon size={16} className="text-muted-foreground flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[10px] text-muted-foreground">{format(selectedDate, "M月", { locale: ja })}の売上合計</div>
                    <div className="text-base font-bold truncate">¥{monthlyTotal.toLocaleString()}</div>
                    <div className="text-[10px] text-muted-foreground">月次累計</div>
                  </div>
                </Card>
              </div>

              {/* Vertical timeline */}
              {loading ? (
                <div className="p-8 text-center text-muted-foreground">読み込み中...</div>
              ) : castRows.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">この日の出勤データがありません</div>
              ) : (
                <Card className="overflow-hidden">
                  <div className="w-full">
                    <div className="w-full">
                      {/* Cast header row */}
                      <div className="flex border-b bg-muted/30 sticky top-0 z-20">
                        <div style={{ width: TIME_LABEL_W }} className="flex-shrink-0 border-r bg-muted/50" />
                        {castRows.map(({ cast, shift }) => (
                          <div
                            key={cast.id}
                            className="flex-1 border-r last:border-r-0 p-1 text-center min-w-0"
                          >
                            {cast.photo ? (
                              <img src={cast.photo} alt={cast.name} className="w-6 h-6 rounded-full object-cover mx-auto mb-0.5" />
                            ) : (
                              <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold mx-auto mb-0.5">
                                {cast.name.charAt(0)}
                              </div>
                            )}
                            <div className="text-[10px] font-semibold truncate leading-tight">{cast.name}</div>
                            <div className="text-[9px] text-muted-foreground leading-tight">
                              {shift.start_time.slice(0, 5)}~{shift.end_time.slice(0, 5)}
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Timeline body */}
                      <div className="flex relative" style={{ height: TOTAL_HEIGHT }}>
                        {/* Time labels */}
                        <div style={{ width: TIME_LABEL_W }} className="flex-shrink-0 border-r relative">
                          {hours.map((h) => (
                            <div
                              key={h}
                              className="absolute text-[10px] text-muted-foreground text-right pr-2 leading-none"
                              style={{ top: (h - TIME_START) * HOUR_HEIGHT - 6, right: 0, width: TIME_LABEL_W }}
                            >
                              {h >= 24 ? h - 24 : h}:00
                            </div>
                          ))}
                        </div>

                        {/* Cast columns */}
                        {castRows.map(({ cast, shift, reservations: castRes }) => {
                          const shiftStartMin = timeToMinutes(shift.start_time);
                          const shiftEndMin = timeToMinutes(shift.end_time);
                          const shiftTop = minutesToPx(shiftStartMin);
                          const shiftH = ((shiftEndMin - shiftStartMin) / 60) * HOUR_HEIGHT;

                          return (
                            <div
                              key={cast.id}
                              className="flex-1 min-w-0 border-r last:border-r-0 relative cursor-crosshair"
                              onClick={(e) => {
                                if (!isAdmin) return;
                                const rect = e.currentTarget.getBoundingClientRect();
                                const y = e.clientY - rect.top;
                                handleTimelineClick(cast.id, y);
                              }}
                            >
                              {/* Hour grid lines */}
                              {hours.map((h) => (
                                <div
                                  key={h}
                                  className="absolute left-0 right-0 border-t border-border/30"
                                  style={{ top: (h - TIME_START) * HOUR_HEIGHT }}
                                />
                              ))}
                              {/* Half-hour lines */}
                              {hours.map((h) => (
                                <div
                                  key={`${h}h`}
                                  className="absolute left-0 right-0 border-t border-border/15"
                                  style={{ top: (h - TIME_START) * HOUR_HEIGHT + HOUR_HEIGHT / 2 }}
                                />
                              ))}

                              {/* Shift background */}
                              <div
                                className="absolute left-1 right-1 bg-primary/5 border border-primary/20 rounded"
                                style={{ top: shiftTop, height: shiftH }}
                              />

                              {/* Reservation blocks */}
                              {castRes.map((res) => {
                                const resStartMin = timeToMinutes(res.start_time);
                                const resTop = minutesToPx(resStartMin);
                                const resH = Math.max((res.duration / 60) * HOUR_HEIGHT, 28);
                                const statusClass = STATUS_COLORS[res.status] || STATUS_COLORS.pending;
                                const endTime = format(
                                  addMinutes(parse(res.start_time.slice(0, 5), "HH:mm", new Date()), res.duration),
                                  "HH:mm"
                                );
                                return (
                                  <div
                                    key={res.id}
                                    className={cn(
                                      "absolute left-1 right-1 rounded border-t-4 px-1.5 py-0.5 overflow-hidden cursor-pointer hover:shadow-md transition-shadow active:scale-[0.98] z-10",
                                      statusClass
                                    )}
                                    style={{ top: resTop + 2, height: resH - 4 }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openDetail(res);
                                    }}
                                  >
                                    <div className="text-[10px] font-bold leading-tight">
                                      {res.start_time.slice(0, 5)}~{endTime}
                                    </div>
                                    <div className="text-xs font-semibold truncate leading-tight">
                                      {res.customer_name}
                                    </div>
                                    {resH > 40 && (
                                      <div className="text-[10px] truncate leading-tight">
                                        {res.duration}分 ¥{res.price.toLocaleString()}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}

                              {/* Current time line */}
                              {isToday && nowMinutes >= TIME_START * 60 && nowMinutes <= TIME_END * 60 && (
                                <div
                                  className="absolute left-0 right-0 border-t-2 border-red-500 z-20 pointer-events-none"
                                  style={{ top: nowPx }}
                                >
                                  <div className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-red-500 rounded-full" />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </Card>
              )}

              {/* Legend */}
              <div className="flex gap-3 mt-2 flex-wrap text-xs">
                {Object.entries(STATUS_LABELS).map(([key, label]) => (
                  <div key={key} className="flex items-center gap-1">
                    <div className={cn("w-3 h-3 rounded border-t-2", STATUS_COLORS[key])} />
                    <span className="text-muted-foreground">{label}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <footer className="py-4 px-4">
          <p className="text-xs text-muted-foreground text-center">© 2025 caskan.jp All rights reserved</p>
        </footer>
      </main>

      {/* Reservation detail sheet */}
      <Sheet open={!!detailRes} onOpenChange={(open) => { if (!open) setDetailRes(null); }}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <div className="flex items-center justify-between">
              <SheetTitle>{editMode ? "予約を編集" : "予約詳細"}</SheetTitle>
              {isAdmin && !editMode && (
                <Button size="sm" variant="outline" onClick={() => setEditMode(true)}>
                  <Pencil size={14} className="mr-1" />編集
                </Button>
              )}
            </div>
          </SheetHeader>

          {detailRes && (
            <div className="mt-4 space-y-4">
              {editMode ? (
                <>
                  <div className="space-y-3">
                    <div>
                      <Label>ステータス</Label>
                      <Select value={editFields.status} onValueChange={(v) => setEditFields((f) => ({ ...f, status: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(STATUS_LABELS).map(([k, v]) => (
                            <SelectItem key={k} value={k}>{v}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>顧客名</Label>
                      <Input value={editFields.customer_name ?? ""} onChange={(e) => setEditFields((f) => ({ ...f, customer_name: e.target.value }))} />
                    </div>
                    <div>
                      <Label>電話番号</Label>
                      <Input value={editFields.customer_phone ?? ""} onChange={(e) => setEditFields((f) => ({ ...f, customer_phone: e.target.value }))} />
                    </div>
                    <div>
                      <Label>コース名</Label>
                      <Input value={editFields.course_name ?? ""} onChange={(e) => setEditFields((f) => ({ ...f, course_name: e.target.value }))} />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label>開始時間</Label>
                        <Input value={editFields.start_time ?? ""} onChange={(e) => setEditFields((f) => ({ ...f, start_time: e.target.value }))} placeholder="HH:MM" />
                      </div>
                      <div>
                        <Label>時間（分）</Label>
                        <Input type="number" value={editFields.duration ?? ""} onChange={(e) => setEditFields((f) => ({ ...f, duration: Number(e.target.value) }))} />
                      </div>
                    </div>
                    <div>
                      <Label>料金</Label>
                      <Input type="number" value={editFields.price ?? ""} onChange={(e) => setEditFields((f) => ({ ...f, price: Number(e.target.value) }))} />
                    </div>
                    <div>
                      <Label>備考</Label>
                      <Input value={editFields.notes ?? ""} onChange={(e) => setEditFields((f) => ({ ...f, notes: e.target.value }))} />
                    </div>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <Button className="flex-1" onClick={handleSaveEdit}><Check size={14} className="mr-1" />保存</Button>
                    <Button variant="outline" className="flex-1" onClick={() => setEditMode(false)}>キャンセル</Button>
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-3 text-sm">
                    <div className="flex items-center gap-2">
                      <span className={cn("text-xs px-2 py-1 rounded", STATUS_COLORS[detailRes.status])}>
                        {STATUS_LABELS[detailRes.status] ?? detailRes.status}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-y-2 text-sm">
                      <span className="text-muted-foreground">日時</span>
                      <span className="font-medium">
                        {format(new Date(detailRes.reservation_date), "M月d日", { locale: ja })} {detailRes.start_time.slice(0, 5)} ({detailRes.duration}分)
                      </span>
                      <span className="text-muted-foreground">顧客名</span>
                      <span className="font-medium">{detailRes.customer_name}</span>
                      <span className="text-muted-foreground">電話番号</span>
                      <span className="font-medium">{detailRes.customer_phone}</span>
                      <span className="text-muted-foreground">コース</span>
                      <span className="font-medium">{detailRes.course_name}</span>
                      <span className="text-muted-foreground">料金</span>
                      <span className="font-medium">¥{detailRes.price.toLocaleString()}</span>
                      {detailRes.nomination_type && (
                        <>
                          <span className="text-muted-foreground">指名</span>
                          <span className="font-medium">{detailRes.nomination_type}</span>
                        </>
                      )}
                      {detailRes.room && (
                        <>
                          <span className="text-muted-foreground">ルーム</span>
                          <span className="font-medium">{detailRes.room}</span>
                        </>
                      )}
                      {detailRes.notes && (
                        <>
                          <span className="text-muted-foreground">備考</span>
                          <span className="font-medium">{detailRes.notes}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="pt-2 border-t space-y-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => {
                        const d = detailRes;
                        const date = new Date(d.reservation_date);
                        const dayNames = ["日", "月", "火", "水", "木", "金", "土"];
                        const dayOfWeek = dayNames[date.getDay()];
                        const dateStr = `${format(date, "M月d日", { locale: ja })}(${dayOfWeek})`;
                        const therapist = d.nomination_type && d.nomination_type !== "none"
                          ? d.nomination_type
                          : "フリー（フリー）";
                        const text = [
                          `${d.customer_name} 様`,
                          `ご予約ありがとうございます。`,
                          ``,
                          `[予約情報]`,
                          `予約日時：${dateStr} ${d.start_time.slice(0, 5)}`,
                          `コース：${d.course_name}`,
                          `セラピスト：${therapist}`,
                          d.room ? `ルーム：${d.room}` : null,
                          `予約名：${d.customer_name}`,
                          `ご要望など：${d.notes ?? ""}`,
                          ``,
                          `[料金]`,
                          `コース料金：${d.price.toLocaleString()}円`,
                          `指名料：0円`,
                          `決済手数料：0円`,
                          `総額：${d.price.toLocaleString()}円`,
                          ``,
                          `【住所】`,
                          `仙台市 青葉区 春日町11-12`,
                          `L'AZURE SENDAI(ラジュール仙台) 1107号室`,
                          `※11階にお部屋がございます。1階とお間違い無いようにご注意ください。`,
                          ``,
                          `▼Googleマップ`,
                          `https://x.gd/gQgmq`,
                          ``,
                          `【注意事項】`,
                          `※必ずお読みください`,
                          ``,
                          `◆お時間"丁度"にインターホンを押してください。防犯上、予約時間以外のインターホンには応答しません。`,
                          ``,
                          `◇予約変更・キャンセルの場合は必ず`,
                          `【TEL】090-8126-4042`,
                          `まで"お電話"`,
                          `にてご連絡お願い致します。`,
                          `※メッセージでのキャンセル不可`,
                        ].filter((l) => l !== null).join("\n");
                        navigator.clipboard.writeText(text);
                        toast({ title: "SMSをコピーしました" });
                      }}
                    >
                      <Copy size={14} className="mr-1" />SMSをコピー
                    </Button>
                    {isAdmin && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-rose-600 border-rose-200 hover:bg-rose-50 w-full"
                        onClick={handleDeleteReservation}
                      >
                        <X size={14} className="mr-1" />キャンセルにする
                      </Button>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
