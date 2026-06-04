import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { CalendarIcon, UserCheck, Clock, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { calcPaymentFee, findPaymentSetting, PaymentSetting } from "@/lib/paymentFee";

interface Cast {
  id: string;
  name: string;
}

interface BackRate {
  id: string;
  course_type: string;
  duration: number;
  customer_price: number;
  therapist_back: number;
}

interface OptionRate {
  id: string;
  option_name: string;
  customer_price: number;
  therapist_back: number;
}

interface NominationRate {
  id: string;
  nomination_type: string;
  customer_price: number;
  therapist_back: number | null;
}

interface DiscountItem {
  id: string;
  name: string;
  discount_type: "fixed" | "percentage";
  discount_value: number;
}

interface FormData {
  cast_id: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  nomination_type: string;
  reservation_date: Date;
  start_time: string;
  end_time: string;
  duration: number;
  room: string;
  course_type: string;
  course_name: string;
  selectedOptions: string[];
  discount_ids: string[];
  discount: number;
  price: number;
  payment_method: string;
  payment_fee: number;
  payment_details: { method: string; amount: number }[] | null;
  reservation_method: string;
  notes: string;
}

interface ReservationFormProps {
  formData: FormData;
  setFormData: (data: FormData) => void;
  casts: Cast[];
  rooms: { id: string; name: string; address: string | null }[];
  backRates: BackRate[];
  optionRates: OptionRate[];
  nominationRates: NominationRate[];
  discounts: DiscountItem[];
  onSubmit: () => void;
  submitLabel?: string;
}

interface NgCast {
  cast_id: string;
  cast_name: string;
  reason: string | null;
}

interface CustomerInfo {
  id: string;
  name: string;
  visit_count: number | null;
  last_visited: string | null;
  is_banned: boolean;
  ban_reason: string | null;
  ng_casts: NgCast[];
}

interface RecentReservation {
  reservation_date: string;
  course_name: string;
  price: number;
  status: string;
  cast_id: string | null;
}

export function ReservationForm({
  formData,
  setFormData,
  casts,
  rooms,
  backRates,
  optionRates,
  nominationRates,
  discounts,
  onSubmit,
  submitLabel = "予約を追加",
}: ReservationFormProps) {
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [recentReservations, setRecentReservations] = useState<RecentReservation[]>([]);
  const [searchingCustomer, setSearchingCustomer] = useState(false);
  const [banReason, setBanReason] = useState("");
  const [ngCastId, setNgCastId] = useState("");
  const [ngReason, setNgReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [paymentSettings, setPaymentSettings] = useState<PaymentSetting[]>([]);

  useEffect(() => {
    supabase
      .from("payment_settings")
      .select("id, payment_method, payment_link, fee_percentage")
      .then(({ data }) => setPaymentSettings((data || []) as PaymentSetting[]));
  }, []);

  const courseTypes = useMemo(() => {
    const types = [...new Set(backRates.map(r => r.course_type))];
    return types;
  }, [backRates]);

  useEffect(() => {
    let subtotal = 0;

    const backRate = backRates.find(
      (rate) =>
        rate.course_type === formData.course_type &&
        rate.duration === formData.duration
    );

    if (backRate) {
      subtotal += backRate.customer_price;
    }

    formData.selectedOptions.forEach((optionName) => {
      const optionRate = optionRates.find((rate) => rate.option_name === optionName);
      if (optionRate) {
        subtotal += optionRate.customer_price;
      }
    });

    if (formData.nomination_type && formData.nomination_type !== "none") {
      const nominationRate = nominationRates.find(
        (rate) => rate.nomination_type === formData.nomination_type
      );
      if (nominationRate) {
        subtotal += nominationRate.customer_price;
      }
    }

    let discountAmount = 0;
    for (const discId of formData.discount_ids) {
      const d = discounts.find(x => x.id === discId);
      if (d) {
        const amt = d.discount_type === "percentage"
          ? Math.round((subtotal * d.discount_value) / 100)
          : d.discount_value;
        discountAmount += amt;
      }
    }
    discountAmount = Math.min(discountAmount, subtotal);
    const totalPrice = subtotal - discountAmount;

    // payment_details がある場合は各エントリの手数料を合算、ない場合は従来通り
    let fee: number;
    if (formData.payment_details && formData.payment_details.length > 0) {
      fee = formData.payment_details.reduce((sum, d) =>
        sum + calcPaymentFee(d.amount, paymentSettings, d.method), 0);
    } else {
      fee = calcPaymentFee(totalPrice, paymentSettings, formData.payment_method);
    }

    // コース名はコースタイプ＋時間から常に自動生成し、デフォルト値が残らないようにする
    const courseName = `${formData.course_type} ${formData.duration}分`;

    if (
      totalPrice !== formData.price ||
      discountAmount !== formData.discount ||
      fee !== formData.payment_fee ||
      courseName !== formData.course_name
    ) {
      setFormData({ ...formData, price: totalPrice, discount: discountAmount, payment_fee: fee, course_name: courseName });
    }
  }, [formData.course_type, formData.duration, formData.selectedOptions, formData.nomination_type, formData.discount_ids, formData.payment_method, formData.payment_details, backRates, optionRates, nominationRates, discounts, paymentSettings]);

  // 開始時間とコース時間（分）から終了時間を自動計算
  useEffect(() => {
    if (!formData.start_time || !formData.duration) return;
    const [h, m] = formData.start_time.split(":").map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return;
    const total = h * 60 + m + formData.duration;
    const eh = Math.floor((total % 1440) / 60); // 日跨ぎはラップ
    const em = total % 60;
    const newEnd = `${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}`;
    if (newEnd !== formData.end_time) {
      setFormData({ ...formData, end_time: newEnd });
    }
  }, [formData.start_time, formData.duration]);

  useEffect(() => {
    const phone = formData.customer_phone.replace(/[-\s]/g, "");
    if (phone.length < 10) {
      setCustomerInfo(null);
      setRecentReservations([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearchingCustomer(true);
      const [custRes, resRes] = await Promise.all([
        supabase
          .from("customers")
          .select("id, name, visit_count, last_visited, is_banned, ban_reason, customer_ng_casts(cast_id, reason, casts(name))")
          .or(`phone.eq.${phone},phone.eq.${formData.customer_phone}`)
          .maybeSingle(),
        supabase
          .from("reservations")
          .select("reservation_date, course_name, price, status, customer_name, cast_id")
          .or(`customer_phone.eq.${phone},customer_phone.eq.${formData.customer_phone}`)
          .neq("status", "cancelled")
          .order("reservation_date", { ascending: false })
          .limit(5),
      ]);
      setSearchingCustomer(false);
      if (custRes.data) {
        const raw = custRes.data as any;
        const ngCasts: NgCast[] = (raw.customer_ng_casts || []).map((n: any) => ({
          cast_id: n.cast_id,
          cast_name: n.casts?.name ?? "",
          reason: n.reason,
        }));
        const info: CustomerInfo = {
          id: raw.id,
          name: raw.name,
          visit_count: raw.visit_count,
          last_visited: raw.last_visited,
          is_banned: raw.is_banned ?? false,
          ban_reason: raw.ban_reason,
          ng_casts: ngCasts,
        };
        setCustomerInfo(info);
        setBanReason(info.ban_reason ?? "");
        if (!formData.customer_name && info.name) {
          setFormData({ ...formData, customer_name: info.name });
        }
      } else {
        setCustomerInfo(null);
        // 顧客マスタに無い場合は過去予約の名前を自動入力
        const pastName = (resRes.data as any[])?.find((r) => r.customer_name)?.customer_name;
        if (!formData.customer_name && pastName) {
          setFormData({ ...formData, customer_name: pastName });
        }
      }
      setRecentReservations((resRes.data || []) as RecentReservation[]);
    }, 500);
    return () => clearTimeout(timer);
  }, [formData.customer_phone]);

  // セラピスト選択後の「本指名」自動設定
  // 初回マウント時（編集で既存予約を開いた直後など）は実行せず、
  // ユーザーが実際にセラピストを変更したときだけ判定する
  const castInitRef = useRef(false);
  useEffect(() => {
    if (!castInitRef.current) {
      castInitRef.current = true;
      return;
    }
    if (!formData.cast_id || !formData.customer_phone) return;
    const phone = formData.customer_phone.replace(/[-\s]/g, "");
    if (phone.length < 10) return;

    supabase
      .from("reservations")
      .select("id")
      .eq("cast_id", formData.cast_id)
      .or(`customer_phone.eq.${phone},customer_phone.eq.${formData.customer_phone}`)
      .neq("status", "cancelled")
      .limit(1)
      .then(({ data }) => {
        if (data && data.length > 0) {
          const honshimei = nominationRates.find(r => r.nomination_type === "本指名");
          if (honshimei) {
            setFormData({ ...formData, nomination_type: "本指名" });
          }
        }
      });
  }, [formData.cast_id]);

  const handleToggleBan = async () => {
    if (!customerInfo) return;
    setSaving(true);
    const newBanned = !customerInfo.is_banned;
    const { error } = await supabase
      .from("customers")
      .update({ is_banned: newBanned, ban_reason: newBanned ? banReason || null : null })
      .eq("id", customerInfo.id);
    setSaving(false);
    if (!error) setCustomerInfo({ ...customerInfo, is_banned: newBanned, ban_reason: newBanned ? banReason : null });
  };

  const handleAddNg = async () => {
    if (!customerInfo || !ngCastId) return;
    setSaving(true);
    const { error } = await supabase.from("customer_ng_casts").insert({
      customer_id: customerInfo.id,
      cast_id: ngCastId,
      reason: ngReason || null,
    });
    setSaving(false);
    if (!error) {
      const castName = casts.find(c => c.id === ngCastId)?.name ?? "";
      setCustomerInfo({
        ...customerInfo,
        ng_casts: [...customerInfo.ng_casts, { cast_id: ngCastId, cast_name: castName, reason: ngReason || null }],
      });
      setNgCastId("");
      setNgReason("");
    }
  };

  const handleRemoveNg = async (castId: string) => {
    if (!customerInfo) return;
    await supabase.from("customer_ng_casts")
      .delete()
      .eq("customer_id", customerInfo.id)
      .eq("cast_id", castId);
    setCustomerInfo({
      ...customerInfo,
      ng_casts: customerInfo.ng_casts.filter(n => n.cast_id !== castId),
    });
  };

  const handleOptionToggle = useCallback((optionName: string) => {
    const newOptions = formData.selectedOptions.includes(optionName)
      ? formData.selectedOptions.filter((o) => o !== optionName)
      : [...formData.selectedOptions, optionName];
    setFormData({ ...formData, selectedOptions: newOptions });
  }, [formData, setFormData]);

  const drOptions = useMemo(() =>
    optionRates.filter(r => r.option_name.startsWith("DR")),
    [optionRates]
  );

  const regularOptions = useMemo(() =>
    optionRates.filter(r => !r.option_name.startsWith("DR")),
    [optionRates]
  );

  const selectedDR = useMemo(() =>
    formData.selectedOptions.find(o => o.startsWith("DR")) || "none",
    [formData.selectedOptions]
  );

  const handleDRChange = useCallback((value: string) => {
    const withoutDR = formData.selectedOptions.filter(o => !o.startsWith("DR"));
    const newOptions = value === "none" ? withoutDR : [...withoutDR, value];
    setFormData({ ...formData, selectedOptions: newOptions });
  }, [formData, setFormData]);

  const availableOptions = useMemo(() =>
    regularOptions.map(rate => rate.option_name),
    [regularOptions]
  );

  const cardFeePct = useMemo(() => findPaymentSetting(paymentSettings, "card")?.fee_percentage ?? 0, [paymentSettings]);
  const paypayFeePct = useMemo(() => findPaymentSetting(paymentSettings, "paypay")?.fee_percentage ?? 0, [paymentSettings]);

  return (
    <div className="space-y-4">
      {/* 1. 電話番号 */}
      <div>
        <Label htmlFor="customer_phone">電話番号</Label>
        <Input
          id="customer_phone"
          placeholder="090-1234-5678"
          value={formData.customer_phone}
          onChange={(e) => setFormData({ ...formData, customer_phone: e.target.value })}
        />
      </div>

      {/* 2. 顧客情報パネル */}
      {searchingCustomer && (
        <p className="text-xs text-muted-foreground">検索中...</p>
      )}
      {!searchingCustomer && formData.customer_phone.replace(/[-\s]/g, "").length >= 10 && (
        <div className="space-y-2">
          {/* 出入り禁止バナー */}
          {customerInfo?.is_banned && (
            <div className="rounded-lg border border-red-400 bg-red-50 dark:bg-red-950/30 p-3 flex items-start gap-2">
              <span className="text-red-600 text-lg font-bold leading-none">⛔</span>
              <div>
                <p className="font-bold text-red-700 dark:text-red-400 text-sm">出入り禁止</p>
                {customerInfo.ban_reason && <p className="text-xs text-red-600 mt-0.5">{customerInfo.ban_reason}</p>}
              </div>
            </div>
          )}

          {/* NGキャスト警告 */}
          {customerInfo && customerInfo.ng_casts.length > 0 && formData.cast_id &&
            customerInfo.ng_casts.some(n => n.cast_id === formData.cast_id) && (
            <div className="rounded-lg border border-orange-400 bg-orange-50 dark:bg-orange-950/30 p-3 flex items-start gap-2">
              <span className="text-orange-500 text-lg font-bold leading-none">⚠️</span>
              <div>
                <p className="font-bold text-orange-700 dark:text-orange-400 text-sm">NGキャスト</p>
                <p className="text-xs text-orange-600 mt-0.5">
                  {customerInfo.ng_casts.find(n => n.cast_id === formData.cast_id)?.reason || "この顧客はこのセラピストをNGに設定しています"}
                </p>
              </div>
            </div>
          )}

          {/* 顧客情報 */}
          <div className={cn(
            "rounded-lg border p-3 text-sm space-y-2",
            customerInfo ? "bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800" : "bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800"
          )}>
            {customerInfo ? (
              <>
                <div className="flex items-center gap-2 font-semibold text-green-700 dark:text-green-400">
                  <UserCheck size={14} />
                  {customerInfo.name}（既存顧客）
                </div>
                <div className="flex gap-4 text-xs text-muted-foreground">
                  <span>来店回数：<strong className="text-foreground">{customerInfo.visit_count ?? 0}回</strong></span>
                  {customerInfo.last_visited && (
                    <span>最終来店：<strong className="text-foreground">{format(new Date(customerInfo.last_visited), "M月d日", { locale: ja })}</strong></span>
                  )}
                </div>
                {/* NGキャスト一覧 */}
                {customerInfo.ng_casts.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {customerInfo.ng_casts.map(n => (
                      <span key={n.cast_id} className="inline-flex items-center gap-1 text-xs bg-orange-100 text-orange-700 rounded px-1.5 py-0.5">
                        NG:{n.cast_name}
                        <button onClick={() => handleRemoveNg(n.cast_id)} className="hover:text-red-600 font-bold">×</button>
                      </span>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 font-semibold">
                <UserCheck size={14} />
                新規顧客
              </div>
            )}

            {/* 直近来店 */}
            {recentReservations.length > 0 && (
              <div className="pt-1 border-t border-current/10 space-y-1">
                <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                  <Clock size={11} />直近の来店
                </p>
                {recentReservations.map((r, i) => {
                  const castName = r.cast_id ? casts.find((c) => c.id === r.cast_id)?.name : null;
                  return (
                    <div key={i} className="flex justify-between text-xs">
                      <span className="text-muted-foreground">
                        {format(new Date(r.reservation_date), "M/d(E)", { locale: ja })}　{r.course_name}
                        {castName && <span className="ml-1">／{castName}</span>}
                      </span>
                      <span className="font-medium">¥{r.price.toLocaleString()}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* 管理操作（既存顧客のみ） */}
            {customerInfo && (
              <div className="pt-2 border-t border-current/10 space-y-2">
                {/* 出入り禁止トグル */}
                <div className="flex gap-2 items-center">
                  <input
                    type="text"
                    placeholder="禁止理由（任意）"
                    value={banReason}
                    onChange={e => setBanReason(e.target.value)}
                    className="flex-1 text-xs px-2 py-1 border rounded"
                  />
                  <button
                    onClick={handleToggleBan}
                    disabled={saving}
                    className={cn(
                      "text-xs px-2 py-1 rounded font-semibold whitespace-nowrap",
                      customerInfo.is_banned
                        ? "bg-gray-200 text-gray-700 hover:bg-gray-300"
                        : "bg-red-100 text-red-700 hover:bg-red-200"
                    )}
                  >
                    {customerInfo.is_banned ? "禁止解除" : "出入り禁止"}
                  </button>
                </div>
                {/* NGキャスト追加 */}
                <div className="flex gap-2 items-center">
                  <select
                    value={ngCastId}
                    onChange={e => setNgCastId(e.target.value)}
                    className="flex-1 text-xs px-2 py-1 border rounded"
                  >
                    <option value="">キャストを選択</option>
                    {casts.filter(c => !customerInfo.ng_casts.some(n => n.cast_id === c.id)).map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    placeholder="理由（任意）"
                    value={ngReason}
                    onChange={e => setNgReason(e.target.value)}
                    className="flex-1 text-xs px-2 py-1 border rounded"
                  />
                  <button
                    onClick={handleAddNg}
                    disabled={saving || !ngCastId}
                    className="text-xs px-2 py-1 rounded font-semibold bg-orange-100 text-orange-700 hover:bg-orange-200 whitespace-nowrap disabled:opacity-40"
                  >
                    NG追加
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3. 予約者名 */}
      <div>
        <Label htmlFor="customer_name">予約者</Label>
        <Input
          id="customer_name"
          placeholder="山田太郎"
          value={formData.customer_name}
          onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
        />
      </div>

      {/* 4. セラピスト */}
      <div>
        <Label>セラピスト</Label>
        <Select
          value={formData.cast_id}
          onValueChange={(value) => setFormData({ ...formData, cast_id: value })}
        >
          <SelectTrigger>
            <SelectValue placeholder="セラピストを選択" />
          </SelectTrigger>
          <SelectContent>
            {casts.map((cast) => (
              <SelectItem key={cast.id} value={cast.id}>
                {cast.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* 5. 指名 */}
      <div>
        <Label>指名</Label>
        <Select
          value={formData.nomination_type}
          onValueChange={(value) => setFormData({ ...formData, nomination_type: value })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">指名なし</SelectItem>
            {nominationRates.map((rate) => (
              <SelectItem key={rate.id} value={rate.nomination_type}>
                {rate.nomination_type} (+¥{rate.customer_price.toLocaleString()})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* 6. 予約日 */}
      <div>
        <Label>予約日</Label>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "w-full justify-start text-left font-normal",
                !formData.reservation_date && "text-muted-foreground"
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {formData.reservation_date ? (
                format(formData.reservation_date, "PPP", { locale: ja })
              ) : (
                <span>日付を選択</span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={formData.reservation_date}
              onSelect={(date) => date && setFormData({ ...formData, reservation_date: date })}
              initialFocus
            />
          </PopoverContent>
        </Popover>
      </div>

      {/* 7. 開始時間 */}
      <div>
        <Label htmlFor="start_time">開始時間</Label>
        <Input
          id="start_time"
          type="time"
          value={formData.start_time}
          onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
        />
      </div>

      {/* 8. 終了時間 */}
      <div>
        <Label htmlFor="end_time">終了時間</Label>
        <Input
          id="end_time"
          type="time"
          value={formData.end_time}
          onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
        />
      </div>

      {/* 9. ルーム */}
      <div>
        <Label htmlFor="room">ルーム</Label>
        <Select
          value={formData.room}
          onValueChange={(value) => setFormData({ ...formData, room: value })}
        >
          <SelectTrigger>
            <SelectValue placeholder="ルームを選択" />
          </SelectTrigger>
          <SelectContent>
            {rooms.map((room) => (
              <SelectItem key={room.id} value={room.name}>
                {room.name}
                {room.address && ` - ${room.address}`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* 10. コースタイプ */}
      <div>
        <Label>コースタイプ</Label>
        <Select
          value={formData.course_type}
          onValueChange={(value) => setFormData({ ...formData, course_type: value })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {courseTypes.map((type) => (
              <SelectItem key={type} value={type}>{type}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* 11. 時間 */}
      <div>
        <Label>時間</Label>
        <Select
          value={formData.duration.toString()}
          onValueChange={(value) =>
            setFormData({
              ...formData,
              duration: parseInt(value),
              course_name: `${formData.course_type} ${value}分`,
            })
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {backRates
              .filter((rate) => rate.course_type === formData.course_type)
              .map((rate) => (
                <SelectItem key={rate.id} value={rate.duration.toString()}>
                  {rate.duration}分 (¥{rate.customer_price.toLocaleString()})
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>

      {/* 12. DR Option - Select */}
      {drOptions.length > 0 && (
        <div>
          <Label>DR（ディープリンパ）</Label>
          <Select value={selectedDR} onValueChange={handleDRChange}>
            <SelectTrigger className="mt-1">
              <SelectValue placeholder="なし" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">なし</SelectItem>
              {drOptions
                .sort((a, b) => {
                  const aMin = parseInt(a.option_name.replace(/\D/g, "")) || 0;
                  const bMin = parseInt(b.option_name.replace(/\D/g, "")) || 0;
                  return aMin - bMin;
                })
                .map((rate) => (
                  <SelectItem key={rate.id} value={rate.option_name}>
                    {rate.option_name}（+¥{rate.customer_price.toLocaleString()}）
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* 13. Other Options - Checkbox */}
      <div>
        <Label>オプション</Label>
        <div className="space-y-2 mt-2">
          {availableOptions.map((optionName) => {
            const rate = optionRates.find((r) => r.option_name === optionName);
            return (
              <div key={optionName} className="flex items-center space-x-2">
                <Checkbox
                  id={optionName}
                  checked={formData.selectedOptions.includes(optionName)}
                  onCheckedChange={() => handleOptionToggle(optionName)}
                />
                <label
                  htmlFor={optionName}
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  {optionName} (+¥{rate?.customer_price.toLocaleString()})
                </label>
              </div>
            );
          })}
        </div>
      </div>

      {/* 14. 割引 - チェックボックス複数選択 */}
      <div>
        <Label>割引</Label>
        <div className="space-y-2 mt-2">
          {discounts.map((d) => (
            <label key={d.id} className="flex items-center gap-3 p-2 border rounded-lg cursor-pointer hover:bg-muted/30">
              <Checkbox
                checked={formData.discount_ids.includes(d.id)}
                onCheckedChange={(checked) => {
                  const next = checked
                    ? [...formData.discount_ids, d.id]
                    : formData.discount_ids.filter(id => id !== d.id);
                  setFormData({ ...formData, discount_ids: next });
                }}
              />
              <span className="text-sm">{d.name}（{d.discount_type === "percentage" ? `-${d.discount_value}%` : `-¥${d.discount_value.toLocaleString()}`}）</span>
            </label>
          ))}
        </div>
      </div>

      {/* 15. お支払い方法 */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <Label>お支払い方法</Label>
          {!formData.payment_details && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                // 分割払いモードへ移行：現在の合計額を最初の行に設定
                setFormData({
                  ...formData,
                  payment_details: [{ method: formData.payment_method || "cash", amount: formData.price }],
                });
              }}
            >
              <Plus size={12} className="mr-1" />支払いを分割
            </Button>
          )}
          {formData.payment_details && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-muted-foreground"
              onClick={() => setFormData({ ...formData, payment_details: null })}
            >
              分割をやめる
            </Button>
          )}
        </div>

        {/* 通常（単一支払い）モード */}
        {!formData.payment_details && (
          <Select
            value={formData.payment_method || "cash"}
            onValueChange={(value) => setFormData({ ...formData, payment_method: value })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="cash">現金</SelectItem>
              <SelectItem value="card">カード{cardFeePct > 0 ? `（手数料${cardFeePct}%）` : ""}</SelectItem>
              <SelectItem value="paypay">PayPay{paypayFeePct > 0 ? `（手数料${paypayFeePct}%）` : ""}</SelectItem>
            </SelectContent>
          </Select>
        )}

        {/* 分割払いモード */}
        {formData.payment_details && (
          <div className="space-y-2">
            {formData.payment_details.map((d, i) => {
              const rowFee = calcPaymentFee(d.amount, paymentSettings, d.method);
              return (
                <div key={i} className="flex items-center gap-2">
                  <Select
                    value={d.method}
                    onValueChange={(v) => {
                      const updated = formData.payment_details!.map((x, j) => j === i ? { ...x, method: v } : x);
                      setFormData({ ...formData, payment_details: updated });
                    }}
                  >
                    <SelectTrigger className="w-28 h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">現金</SelectItem>
                      <SelectItem value="card">カード</SelectItem>
                      <SelectItem value="paypay">PayPay</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="flex-1 relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">¥</span>
                    <Input
                      type="number"
                      min="0"
                      className="pl-7 h-9 text-sm"
                      value={d.amount === 0 ? "" : d.amount}
                      onChange={(e) => {
                        const updated = formData.payment_details!.map((x, j) =>
                          j === i ? { ...x, amount: Number(e.target.value) || 0 } : x
                        );
                        setFormData({ ...formData, payment_details: updated });
                      }}
                    />
                  </div>
                  {rowFee > 0 && (
                    <span className="text-xs text-muted-foreground whitespace-nowrap">手数料¥{rowFee.toLocaleString()}</span>
                  )}
                  {formData.payment_details!.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 text-muted-foreground"
                      onClick={() => {
                        const updated = formData.payment_details!.filter((_, j) => j !== i);
                        setFormData({ ...formData, payment_details: updated });
                      }}
                    >
                      <Trash2 size={14} />
                    </Button>
                  )}
                </div>
              );
            })}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full h-8 text-xs border-dashed"
              onClick={() => {
                setFormData({
                  ...formData,
                  payment_details: [...formData.payment_details!, { method: "cash", amount: 0 }],
                });
              }}
            >
              <Plus size={12} className="mr-1" />支払い行を追加
            </Button>
            {/* 合計チェック */}
            {(() => {
              const detailSum = formData.payment_details!.reduce((s, d) => s + d.amount, 0);
              const diff = formData.price - detailSum;
              return diff !== 0 ? (
                <p className={`text-xs ${diff > 0 ? "text-orange-500" : "text-rose-500"}`}>
                  {diff > 0
                    ? `残り ¥${diff.toLocaleString()} 未割当`
                    : `¥${Math.abs(diff).toLocaleString()} 超過しています`}
                </p>
              ) : (
                <p className="text-xs text-green-600">✓ 合計が一致しています</p>
              );
            })()}
          </div>
        )}
      </div>

      {/* 16. メールアドレス */}
      <div>
        <Label htmlFor="customer_email">メールアドレス</Label>
        <Input
          id="customer_email"
          type="email"
          placeholder="example@email.com"
          value={formData.customer_email}
          onChange={(e) => setFormData({ ...formData, customer_email: e.target.value })}
        />
      </div>

      {/* 17. 備考 */}
      <div>
        <Label htmlFor="notes">備考</Label>
        <Textarea
          id="notes"
          placeholder="特記事項があれば記入してください"
          value={formData.notes}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
        />
      </div>

      {/* 18. 合計金額表示 */}
      <div className="pt-4 border-t space-y-1">
        {formData.discount > 0 && (
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>割引</span>
            <span className="text-rose-600">-¥{formData.discount.toLocaleString()}</span>
          </div>
        )}
        {formData.payment_details ? (
          // 分割払い内訳
          formData.payment_details.map((d, i) => {
            const rowFee = calcPaymentFee(d.amount, paymentSettings, d.method);
            const label = d.method === "cash" ? "現金" : d.method === "paypay" ? "PayPay" : "カード";
            return (
              <div key={i} className="flex justify-between text-sm text-muted-foreground">
                <span>{label}</span>
                <span>
                  ¥{d.amount.toLocaleString()}
                  {rowFee > 0 && <span className="text-xs ml-1">（内手数料¥{rowFee.toLocaleString()}）</span>}
                </span>
              </div>
            );
          })
        ) : (
          formData.payment_fee > 0 && (
            <>
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>小計</span>
                <span>¥{formData.price.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>決済手数料</span>
                <span>+¥{formData.payment_fee.toLocaleString()}</span>
              </div>
            </>
          )
        )}
        <div className="text-right">
          <p className="text-sm text-muted-foreground mb-1">合計金額</p>
          <p className="text-2xl font-bold text-primary">¥{(formData.price + (formData.payment_fee || 0)).toLocaleString()}</p>
        </div>
      </div>

      {/* 19. 予約追加ボタン */}
      <Button onClick={onSubmit} className="w-full" size="lg">
        {submitLabel}
      </Button>
    </div>
  );
}
