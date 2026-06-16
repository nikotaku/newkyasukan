import { useState, useEffect, useMemo } from "react";
import { format, addDays, subDays, addMonths, subMonths, parse, addMinutes, startOfMonth, endOfMonth, startOfWeek, eachDayOfInterval } from "date-fns";
import { toExtTime } from "@/lib/timeFormat";
import { ja } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Plus, TrendingUp, Calendar as CalendarIcon, X, Pencil, MessageSquare, Heart } from "lucide-react";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/Sidebar";
import { TabMenu } from "@/components/TabMenu";
import { DailyReservationTimeline } from "@/components/DailyReservationTimeline";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ReservationForm } from "@/components/ReservationForm";
import { useAuth } from "@/hooks/useAuth";
import { useShopSettings } from "@/hooks/useShopSettings";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { findPaymentSetting, PaymentSetting } from "@/lib/paymentFee";
import { openSmsApp } from "@/lib/sms";
import { getBusinessDateFromCache } from "@/hooks/useShopSettings";
import { PaymentReminderPopup } from "@/components/PaymentReminderPopup";

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
  customer_email: string | null;
  course_name: string;
  course_type: string | null;
  nomination_type: string | null;
  price: number;
  discount: number | null;
  options: string[] | null;
  payment_method: string | null;
  payment_fee: number | null;
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
  // 深夜またぎ（06:00 未満）は +24h で翌枠に配置
  return (h < 6 ? h + 24 : h) * 60 + m;
}

function minutesToPx(minutes: number) {
  return ((minutes - TIME_START * 60) / 60) * HOUR_HEIGHT;
}

// 当日ステータスボード：予約詳細と同じステータス種別に統一（キャンセルは日別表示から除外）
const BOARD_STATUSES = ["pending", "sms_waiting", "confirmed", "completed"] as const;

const BOARD_STATUS_STYLE: Record<string, { header: string; border: string }> = {
  pending: { header: "bg-amber-100 text-amber-800", border: "border-amber-300" },
  sms_waiting: { header: "bg-purple-100 text-purple-800", border: "border-purple-300" },
  confirmed: { header: "bg-blue-100 text-blue-800", border: "border-blue-300" },
  completed: { header: "bg-emerald-100 text-emerald-800", border: "border-emerald-300" },
};

function StatusBox({
  status,
  reservations,
  castNameMap,
  onStatusChange,
  onEdit,
  onSms,
  onThanksSms,
  isAdmin,
}: {
  status: string;
  reservations: Reservation[];
  castNameMap: Map<string, string>;
  onStatusChange: (id: string, status: string) => void;
  onEdit: (res: Reservation) => void;
  onSms: (res: Reservation) => void;
  onThanksSms: (res: Reservation) => void;
  isAdmin: boolean;
}) {
  const style = BOARD_STATUS_STYLE[status];
  return (
    <div className={`rounded-lg border-2 ${style.border} bg-white flex flex-col`}>
      <div className={`px-3 py-2 rounded-t-lg ${style.header} font-bold text-sm flex items-center justify-between`}>
        <span>{STATUS_LABELS[status]}</span>
        <span className="text-xs font-normal opacity-80">{reservations.length}件</span>
      </div>
      <div className="flex-1 p-2 space-y-2 min-h-[80px] max-h-[360px] overflow-y-auto">
        {reservations.length === 0 ? (
          <p className="text-center text-muted-foreground text-xs py-4">なし</p>
        ) : (
          reservations.map((res) => (
            <div key={res.id} className="bg-gray-50 rounded-md p-2 text-xs border border-gray-100">
              <div className="font-semibold mb-0.5">{res.customer_name}</div>
              <div className="text-muted-foreground space-y-0.5">
                <div>{toExtTime(res.start_time)}（{res.duration}分）</div>
                <div>{castNameMap.get(res.cast_id) ?? "未設定"} / {res.course_name}</div>
                <div>{res.customer_phone}</div>
              </div>
              <div className="mt-1.5 flex gap-1 flex-wrap">
                <button
                  onClick={() => onSms(res)}
                  className="text-[10px] px-1.5 py-0.5 rounded border bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100 transition-colors font-medium"
                >
                  SMS
                </button>
                <button
                  onClick={() => onThanksSms(res)}
                  className="text-[10px] px-1.5 py-0.5 rounded border bg-pink-50 border-pink-200 text-pink-700 hover:bg-pink-100 transition-colors font-medium"
                >
                  サンクス
                </button>
                {isAdmin && (
                  <button
                    onClick={() => onEdit(res)}
                    className="text-[10px] px-1.5 py-0.5 rounded border bg-white border-gray-200 text-gray-600 hover:bg-gray-100 transition-colors font-medium"
                  >
                    編集
                  </button>
                )}
              </div>
              <div className="mt-1 flex gap-1 flex-wrap">
                {BOARD_STATUSES.filter((s) => s !== status).map((s) => (
                  <button
                    key={s}
                    onClick={() => onStatusChange(res.id, s)}
                    className="text-[10px] px-1.5 py-0.5 rounded border bg-white border-gray-200 text-gray-500 hover:bg-gray-100 transition-colors"
                  >
                    {STATUS_LABELS[s]}へ
                  </button>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default function Schedule() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(getBusinessDateFromCache);
  const [selectedView, setSelectedView] = useState<"cast" | "room">("cast");
  const [shifts, setShifts] = useState<(Shift & { cast: Cast })[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [monthlyTotal, setMonthlyTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isAddOpen, setIsAddOpen] = useState(false);

  // Detail/Edit sheet
  const [detailRes, setDetailRes] = useState<Reservation | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editStatus, setEditStatus] = useState<string>("confirmed");

  const { user, loading: authLoading, isAdmin } = useAuth();
  const { dayStartTime, loaded: settingsLoaded, businessToday } = useShopSettings();
  useEffect(() => {
    if (settingsLoaded) setSelectedDate(businessToday);
  }, [settingsLoaded]); // eslint-disable-line
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
    discount_ids: [] as string[],
    discount: 0,
    price: 12000,
    payment_method: "cash",
    payment_fee: 0,
    payment_details: null as { method: string; amount: number }[] | null,
    reservation_method: "",
    notes: "",
  });

  const [editFormData, setEditFormData] = useState({
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
    course_name: "",
    selectedOptions: [] as string[],
    discount_ids: [] as string[],
    discount: 0,
    price: 0,
    payment_method: "cash",
    payment_fee: 0,
    payment_details: null as { method: string; amount: number }[] | null,
    reservation_method: "",
    notes: "",
  });

  const [casts, setCasts] = useState<{ id: string; name: string }[]>([]);
  const [rooms, setRooms] = useState<{ id: string; name: string; address: string | null; sms_text: string | null; map_url: string | null }[]>([]);
  const [backRates, setBackRates] = useState<any[]>([]);
  const [optionRates, setOptionRates] = useState<any[]>([]);
  const [nominationRates, setNominationRates] = useState<any[]>([]);
  const [discounts, setDiscounts] = useState<{ id: string; name: string; discount_type: "fixed" | "percentage"; discount_value: number }[]>([]);
  const [paymentSettings, setPaymentSettings] = useState<PaymentSetting[]>([]);
  const [thanksTemplate, setThanksTemplate] = useState<string | null>(null);

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
    const [{ data: c }, { data: r }, { data: b }, { data: o }, { data: n }, { data: d }, { data: p }, { data: t }] = await Promise.all([
      supabase.from("casts").select("id, name").order("name"),
      supabase.from("rooms").select("id, name, address, sms_text, map_url").eq("is_active", true).order("name"),
      supabase.from("back_rates").select("*").order("display_order"),
      supabase.from("option_rates").select("*").order("display_order"),
      supabase.from("nomination_rates").select("*"),
      supabase.from("discounts").select("id, name, discount_type, discount_value, is_active").eq("is_active", true).order("name"),
      supabase.from("payment_settings").select("id, payment_method, payment_link, fee_percentage"),
      supabase.from("sms_auto_templates").select("message").eq("trigger", "thanks").eq("is_active", true).limit(1),
    ]);
    if (c) setCasts(c);
    if (r) setRooms(r);
    if (b) setBackRates(b);
    if (o) setOptionRates(o);
    if (n) setNominationRates(n);
    if (d) setDiscounts(d as any);
    if (p) setPaymentSettings(p as PaymentSetting[]);
    setThanksTemplate(t && t.length > 0 ? t[0].message : null);
  };

  const fetchData = async () => {
    setLoading(true);
    const dateStr = format(selectedDate, "yyyy-MM-dd");
    const nextDateStr = format(addDays(selectedDate, 1), "yyyy-MM-dd");
    const monthStart = format(startOfMonth(selectedDate), "yyyy-MM-dd");
    const monthEnd = format(endOfMonth(selectedDate), "yyyy-MM-dd");

    const [{ data: shiftsData }, { data: reservationsData }, { data: nextResData }, { data: monthData }] = await Promise.all([
      supabase.from("shifts").select("*, cast:casts(id, name, photo)").eq("shift_date", dateStr),
      supabase.from("reservations").select("*").eq("reservation_date", dateStr).gte("start_time", dayStartTime).neq("status", "cancelled"),
      // 深夜またぎ：翌日日付で保存されているが営業開始前の予約は当日扱い
      supabase.from("reservations").select("*").eq("reservation_date", nextDateStr).lt("start_time", dayStartTime).neq("status", "cancelled"),
      supabase.from("reservations").select("price").gte("reservation_date", monthStart).lte("reservation_date", monthEnd).neq("status", "cancelled"),
    ]);

    setShifts((shiftsData as any) || []);
    setReservations([...(reservationsData || []), ...(nextResData || [])]);
    setMonthlyTotal((monthData || []).reduce((sum, r: any) => sum + (r.price || 0), 0));
    setLoading(false);
  };

  const dailyTotal = useMemo(() => reservations.reduce((sum, r) => sum + (r.price || 0), 0), [reservations]);

  const castNameMap = useMemo(() => {
    const m = new Map<string, string>();
    casts.forEach((c) => m.set(c.id, c.name));
    return m;
  }, [casts]);

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
        payment_method: formData.payment_details ? null : (formData.payment_method || null),
        payment_fee: formData.payment_fee || 0,
        payment_details: formData.payment_details || null,
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

  const buildReservationSms = (d: Reservation): string => {
    const date = new Date(d.reservation_date);
    const dayNames = ["日", "月", "火", "水", "木", "金", "土"];
    const dayOfWeek = dayNames[date.getDay()];
    const dateStr = `${format(date, "M月d日", { locale: ja })}(${dayOfWeek})`;
    const castName = castNameMap.get(d.cast_id) ?? "";
    const nominationLabel = d.nomination_type && d.nomination_type !== "none" ? d.nomination_type : "フリー";
    const fee = d.payment_fee || 0;
    const grandTotal = d.price + fee;
    const paySetting = findPaymentSetting(paymentSettings, d.payment_method || "");
    const payLink = fee > 0 && paySetting?.payment_link ? paySetting.payment_link : null;
    const roomRecord = rooms.find((r) => r.name === d.room);
    const roomSmsText = roomRecord?.sms_text ?? null;
    const roomAddress = roomRecord?.address ?? null;
    const roomMapUrl = roomRecord?.map_url ?? null;

    const backRate = backRates.find(
      (r) => r.course_type === d.course_type && r.duration === d.duration
    );
    const coursePrice = backRate?.customer_price ?? 0;
    const optionsTotal = (d.options ?? []).reduce((sum, optName) => {
      const opt = optionRates.find((r) => r.option_name === optName);
      return sum + (opt?.customer_price ?? 0);
    }, 0);
    const nominationFee = d.nomination_type && d.nomination_type !== "none"
      ? (nominationRates.find((r) => r.nomination_type === d.nomination_type)?.customer_price ?? 0)
      : 0;
    const discountAmount = d.discount ?? 0;

    return [
      `${d.customer_name} 様`,
      `ご予約ありがとうございます。`,
      ``,
      `[予約情報]`,
      `予約日時：${dateStr} ${toExtTime(d.start_time)}`,
      `コース：${d.course_name}`,
      (d.options ?? []).length > 0 ? `オプション：${(d.options ?? []).join("、")}` : null,
      `セラピスト：${castName ? `${castName}（${nominationLabel}）` : nominationLabel}`,
      d.room ? `ルーム：${d.room}` : null,
      roomAddress ? `住所：${roomAddress}` : null,
      `予約名：${d.customer_name}`,
      `ご要望など：${d.notes ?? ""}`,
      ``,
      `[料金]`,
      `コース料金：${coursePrice.toLocaleString()}円`,
      optionsTotal > 0 ? `オプション料金：${optionsTotal.toLocaleString()}円` : null,
      `指名料：${nominationFee.toLocaleString()}円`,
      discountAmount > 0 ? `割引：-${discountAmount.toLocaleString()}円` : null,
      `決済手数料：${fee.toLocaleString()}円`,
      `総額：${grandTotal.toLocaleString()}円`,
      ...(payLink ? [``, `▼${paySetting?.payment_method ?? "カード"}決済はこちら`, payLink] : []),
      roomSmsText
        ? `\n${roomSmsText}${roomMapUrl ? `\n\n📍${roomMapUrl}` : ""}`
        : roomAddress
          ? `\n【住所】\n${roomAddress}${roomMapUrl ? `\n📍${roomMapUrl}` : ""}`
          : roomMapUrl ? `\n📍${roomMapUrl}` : null,
    ].filter((l) => l !== null).join("\n");
  };

  // コピーしつつ端末のSMS送信画面を開く（宛先＝予約の電話番号、本文プリセット）
  const openReservationSms = (d: Reservation) => {
    const body = buildReservationSms(d);
    navigator.clipboard.writeText(body).catch(() => {});
    toast({ title: "SMS送信画面を開きます", description: "本文はコピー済みです" });
    openSmsApp(d.customer_phone, body);
  };

  const buildThanksSms = (d: Reservation): string | null => {
    if (!thanksTemplate) return null;
    const date = new Date(d.reservation_date);
    const dayNames = ["日", "月", "火", "水", "木", "金", "土"];
    const dateStr = `${format(date, "M月d日", { locale: ja })}(${dayNames[date.getDay()]})`;
    return thanksTemplate
      .replaceAll("{customer_name}", d.customer_name)
      .replaceAll("{date}", dateStr)
      .replaceAll("{cast_name}", castNameMap.get(d.cast_id) ?? "")
      .replaceAll("{course_name}", d.course_name);
  };

  const openThanksSms = (d: Reservation) => {
    const body = buildThanksSms(d);
    if (!body) {
      toast({
        title: "サンクスSMSが未登録です",
        description: "システム > SMS自動送信 でトリガー「サンクスSMS」のテンプレートを登録してください",
        variant: "destructive",
      });
      return;
    }
    navigator.clipboard.writeText(body).catch(() => {});
    toast({ title: "SMS送信画面を開きます", description: "本文はコピー済みです" });
    openSmsApp(d.customer_phone, body);
  };

  const openDetail = (res: Reservation) => {
    setDetailRes(res);
    setEditStatus(res.status);
    setEditMode(false);
  };

  // 編集モードに入るとき、予約データを ReservationForm の形に展開
  const startEdit = (target?: Reservation) => {
    const res = target ?? detailRes;
    if (!res) return;
    setDetailRes(res);
    setEditStatus(res.status);
    setEditFormData({
      cast_id: res.cast_id,
      customer_name: res.customer_name,
      customer_phone: res.customer_phone,
      customer_email: res.customer_email ?? "",
      nomination_type: res.nomination_type ?? "none",
      reservation_date: new Date(res.reservation_date),
      start_time: res.start_time.slice(0, 5),
      end_time: "",
      duration: res.duration,
      room: res.room ?? "",
      course_type: res.course_type ?? "aroma",
      course_name: res.course_name,
      selectedOptions: res.options ?? [],
      discount_ids: res.discount_ids || [],
      discount: res.discount ?? 0,
      price: res.price,
      payment_method: res.payment_method ?? "cash",
      payment_fee: res.payment_fee ?? 0,
      payment_details: (res as any).payment_details ?? null,
      reservation_method: "",
      notes: res.notes ?? "",
    });
    setEditMode(true);
  };

  const handleSaveEdit = async () => {
    if (!detailRes) return;
    try {
      // Recompute price from master data to avoid stale-state race conditions
      const dur = Number(editFormData.duration);
      const backRate = backRates.find((r) => r.course_type === editFormData.course_type && r.duration === dur);
      let subtotal = backRate?.customer_price ?? 0;
      (editFormData.selectedOptions ?? []).forEach((optName) => {
        subtotal += optionRates.find((r) => r.option_name === optName)?.customer_price ?? 0;
      });
      if (editFormData.nomination_type && editFormData.nomination_type !== "none") {
        subtotal += nominationRates.find((r) => r.nomination_type === editFormData.nomination_type)?.customer_price ?? 0;
      }
      let discountAmt = 0;
      for (const discId of (editFormData.discount_ids ?? [])) {
        const d = discounts.find((x) => x.id === discId);
        if (d) {
          discountAmt += d.discount_type === "percentage"
            ? Math.round((subtotal * d.discount_value) / 100)
            : d.discount_value;
        }
      }
      discountAmt = Math.min(discountAmt, subtotal);
      const computedPrice = subtotal > 0 ? subtotal - discountAmt : Number(editFormData.price);
      const computedDiscount = subtotal > 0 ? discountAmt : Number(editFormData.discount ?? 0);
      const courseName = `${editFormData.course_type} ${dur}分`;

      const { error } = await supabase.from("reservations").update({
        cast_id: editFormData.cast_id,
        customer_name: editFormData.customer_name,
        customer_phone: editFormData.customer_phone,
        customer_email: editFormData.customer_email || null,
        reservation_date: format(editFormData.reservation_date, "yyyy-MM-dd"),
        start_time: editFormData.start_time,
        duration: dur,
        course_type: editFormData.course_type,
        course_name: courseName,
        options: editFormData.selectedOptions,
        nomination_type: editFormData.nomination_type === "none" ? null : editFormData.nomination_type,
        price: computedPrice,
        discount: computedDiscount,
        discount_ids: editFormData.discount_ids ?? [],
        payment_method: editFormData.payment_details ? null : (editFormData.payment_method || null),
        payment_fee: editFormData.payment_fee || 0,
        payment_details: editFormData.payment_details || null,
        room: editFormData.room || null,
        status: editStatus,
        notes: editFormData.notes || null,
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

  const handleQuickStatusChange = async (id: string, newStatus: string) => {
    // 楽観的更新
    setReservations((prev) => prev.map((r) => (r.id === id ? { ...r, status: newStatus } : r)));
    const { error } = await supabase.from("reservations").update({ status: newStatus }).eq("id", id);
    if (error) {
      toast({ title: "エラー", description: "ステータスの更新に失敗しました", variant: "destructive" });
      fetchData();
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
      <PaymentReminderPopup />
      <DashboardHeader onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="pt-[60px] md:ml-[180px] transition-all duration-300">
        <div className="p-3 md:p-4">
          {/* Header */}
          <div className="space-y-2 mb-2">
            {/* Row 1: month navigation */}
            <div className="flex items-center justify-center gap-1 flex-wrap">
              <Button variant="outline" size="icon" onClick={() => setSelectedDate(startOfMonth(subMonths(selectedDate, 1)))} title="前の月">
                <ChevronLeft size={18} />
              </Button>
              <h1 className="text-base font-bold px-2 min-w-[120px] text-center">
                {format(selectedDate, "yyyy年M月", { locale: ja })}
              </h1>
              <Button variant="outline" size="icon" onClick={() => setSelectedDate(startOfMonth(addMonths(selectedDate, 1)))} title="次の月">
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

          {/* Month tabs - 選択中の月の全日を横スクロールで表示 */}
          <TabMenu
            activeDate={format(selectedDate, "yyyy-MM-dd")}
            dates={eachDayOfInterval({
              start: startOfMonth(selectedDate),
              end: endOfMonth(selectedDate),
            }).map((d) => ({
              date: format(d, "yyyy-MM-dd"),
              label: format(d, "d(E)", { locale: ja }),
            }))}
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

              {/* 当日ステータス */}
              <div className="mb-3">
                <h2 className="font-semibold text-xs text-muted-foreground mb-2">当日ステータス</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                  {BOARD_STATUSES.map((s) => (
                    <StatusBox
                      key={s}
                      status={s}
                      reservations={reservations.filter((r) => r.status === s)}
                      castNameMap={castNameMap}
                      onStatusChange={handleQuickStatusChange}
                      onEdit={(res) => startEdit(res)}
                      onSms={openReservationSms}
                      onThanksSms={openThanksSms}
                      isAdmin={isAdmin}
                    />
                  ))}
                </div>
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
                                      {toExtTime(res.start_time)}~{endTime}
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
                <Button size="sm" variant="outline" onClick={() => startEdit()}>
                  <Pencil size={14} className="mr-1" />編集
                </Button>
              )}
            </div>
          </SheetHeader>

          {detailRes && (
            <div className="mt-4 space-y-4">
              {editMode ? (
                <>
                  <div>
                    <Label>ステータス</Label>
                    <Select value={editStatus} onValueChange={setEditStatus}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(STATUS_LABELS).map(([k, v]) => (
                          <SelectItem key={k} value={k}>{v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <ReservationForm
                    formData={editFormData}
                    setFormData={setEditFormData}
                    casts={casts}
                    rooms={rooms}
                    backRates={backRates}
                    optionRates={optionRates}
                    nominationRates={nominationRates}
                    discounts={discounts}
                    onSubmit={handleSaveEdit}
                    submitLabel="変更を保存"
                  />
                  <Button variant="outline" className="w-full" onClick={() => setEditMode(false)}>編集をやめる</Button>
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
                        {format(new Date(detailRes.reservation_date), "M月d日", { locale: ja })} {toExtTime(detailRes.start_time)} ({detailRes.duration}分)
                      </span>
                      <span className="text-muted-foreground">顧客名</span>
                      <span className="font-medium">{detailRes.customer_name}</span>
                      <span className="text-muted-foreground">電話番号</span>
                      <span className="font-medium">{detailRes.customer_phone}</span>
                      <span className="text-muted-foreground">コース</span>
                      <span className="font-medium">{detailRes.course_name}</span>
                      {(detailRes.options ?? []).length > 0 && (
                        <>
                          <span className="text-muted-foreground">オプション</span>
                          <span className="font-medium">{(detailRes.options ?? []).join("、")}</span>
                        </>
                      )}
                      {(detailRes.discount ?? 0) > 0 && (
                        <>
                          <span className="text-muted-foreground">割引</span>
                          <span className="font-medium text-rose-600">-¥{(detailRes.discount ?? 0).toLocaleString()}</span>
                        </>
                      )}
                      <span className="text-muted-foreground">料金</span>
                      <span className="font-medium">¥{detailRes.price.toLocaleString()}</span>
                      {(detailRes.payment_fee ?? 0) > 0 && (
                        <>
                          <span className="text-muted-foreground">決済手数料</span>
                          <span className="font-medium">+¥{(detailRes.payment_fee ?? 0).toLocaleString()}</span>
                          <span className="text-muted-foreground">総額</span>
                          <span className="font-semibold text-primary">¥{(detailRes.price + (detailRes.payment_fee ?? 0)).toLocaleString()}</span>
                        </>
                      )}
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
                      onClick={() => openReservationSms(detailRes)}
                    >
                      <MessageSquare size={14} className="mr-1" />予約確認SMS
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full text-pink-600 border-pink-200 hover:bg-pink-50"
                      onClick={() => openThanksSms(detailRes)}
                    >
                      <Heart size={14} className="mr-1" />サンクスSMS
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
