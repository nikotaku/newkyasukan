import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, ArrowLeft, CheckCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ja } from "date-fns/locale";

interface Cast {
  id: string;
  name: string;
  photo: string | null;
}

interface Reservation {
  id: string;
  customer_name: string;
  start_time: string;
  course_name: string;
  price: number;
  payment_method: string;
  status: string;
}

const PAYMENT_METHODS = [
  { value: "cash", label: "現金" },
  { value: "card", label: "カード" },
  { value: "paypay", label: "PayPay" },
];

export default function TherapistCheckout() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [cast, setCast] = useState<Cast | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<string | null>(null);

  // 予約データ
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [paymentEdits, setPaymentEdits] = useState<Record<string, string>>({});
  const [reservationsLoading, setReservationsLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState(format(new Date(), "yyyy-MM-dd"));

  // 売上メモ・手動調整
  const [salesNotes, setSalesNotes] = useState("");
  const [manualAdjustment, setManualAdjustment] = useState(0);

  const [cleaning, setCleaning] = useState({
    room_cleaned: false,
    supplies_stocked: false,
    trash_taken_out: false,
    equipment_checked: false,
    notes: "",
  });

  const [feedback, setFeedback] = useState({
    rating: 5,
    good_points: "",
    improvement_points: "",
    customer_feedback: "",
  });

  useEffect(() => {
    if (!token) { navigate("/"); return; }
    const fetchCast = async () => {
      try {
        const { data, error } = await supabase.rpc("get_cast_by_access_token", { p_token: token });
        if (error) throw error;
        const row = Array.isArray(data) ? data[0] : data;
        if (!row) { navigate("/"); return; }
        setCast(row as Cast);
      } catch {
        navigate("/");
      } finally {
        setLoading(false);
      }
    };
    fetchCast();
  }, [token, navigate]);

  const fetchReservations = useCallback(async () => {
    if (!cast) return;
    setReservationsLoading(true);
    try {
      const { data, error } = await supabase
        .from("reservations")
        .select("id, customer_name, start_time, course_name, price, payment_method, status")
        .eq("cast_id", cast.id)
        .eq("reservation_date", selectedDate)
        .order("start_time");
      if (error) throw error;
      const list = data || [];
      setReservations(list);
      // payment_method の初期値をセット
      const edits: Record<string, string> = {};
      list.forEach((r) => { edits[r.id] = r.payment_method || "cash"; });
      setPaymentEdits(edits);
    } catch {
      toast.error("予約の取得に失敗しました");
    } finally {
      setReservationsLoading(false);
    }
  }, [cast, selectedDate]);

  useEffect(() => {
    if (cast) fetchReservations();
  }, [cast, fetchReservations]);

  // 支払い方法別合計を計算
  const totals = reservations.reduce(
    (acc, r) => {
      if (r.status === "cancelled") return acc;
      const method = paymentEdits[r.id] || r.payment_method || "cash";
      acc[method] = (acc[method] || 0) + (r.price || 0);
      return acc;
    },
    {} as Record<string, number>
  );

  const cashTotal = (totals["cash"] || 0);
  const cardTotal = (totals["card"] || 0);
  const paypayTotal = (totals["paypay"] || 0);
  const grandTotal = cashTotal + cardTotal + paypayTotal + manualAdjustment;
  const completedCount = reservations.filter((r) => r.status !== "cancelled").length;

  const handlePaymentChange = async (reservationId: string, method: string) => {
    setPaymentEdits((prev) => ({ ...prev, [reservationId]: method }));
    // DB にも即時反映
    await supabase
      .from("reservations")
      .update({ payment_method: method })
      .eq("id", reservationId);
  };

  const handleSalesSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const { error } = await supabase.from("daily_sales_records").insert([{
        date: selectedDate,
        cash_amount: cashTotal,
        card_amount: cardTotal,
        paypay_amount: paypayTotal,
        total_amount: grandTotal,
        customer_count: completedCount,
        notes: salesNotes,
        cast_id: cast?.id,
      }]);
      if (error) throw error;
      setSubmitted("sales");
    } catch {
      toast.error("送信に失敗しました");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCleaningSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const { error } = await supabase.from("cleaning_checklists").insert([{
        ...cleaning,
        date: selectedDate,
        cast_id: cast?.id,
      }]);
      if (error) throw error;
      setSubmitted("cleaning");
    } catch {
      toast.error("送信に失敗しました");
    } finally {
      setSubmitting(false);
    }
  };

  const handleFeedbackSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const { error } = await supabase.from("daily_feedback").insert([{
        ...feedback,
        date: selectedDate,
        cast_id: cast?.id,
      }]);
      if (error) throw error;
      setSubmitted("feedback");
    } catch {
      toast.error("送信に失敗しました");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!cast) return null;

  const SuccessCard = ({ label }: { label: string }) => (
    <Card>
      <CardContent className="pt-12 pb-12 text-center">
        <CheckCircle className="mx-auto mb-3 text-green-500" size={48} />
        <p className="font-semibold text-lg">{label}を送信しました</p>
        <Button className="mt-4" variant="outline" onClick={() => setSubmitted(null)}>戻る</Button>
      </CardContent>
    </Card>
  );

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => navigate(`/therapist/${token}`)}>
              <ArrowLeft size={16} className="mr-1" />マイページ
            </Button>
            <div className="flex items-center gap-3 ml-2">
              {cast.photo && (
                <img src={cast.photo} alt={cast.name} className="h-8 w-8 rounded-full object-cover" />
              )}
              <div>
                <p className="font-semibold">{cast.name}</p>
                <p className="text-xs text-muted-foreground">
                  {format(new Date(), "yyyy年MM月dd日（E）", { locale: ja })}
                </p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-lg">
        <h1 className="text-xl font-bold mb-6">退勤フォーム</h1>

        <Tabs defaultValue="sales">
          <TabsList className="w-full mb-6">
            <TabsTrigger value="sales" className="flex-1">売上入力</TabsTrigger>
            <TabsTrigger value="cleaning" className="flex-1">清掃チェック</TabsTrigger>
            <TabsTrigger value="feedback" className="flex-1">フィードバック</TabsTrigger>
          </TabsList>

          {/* ─── 売上入力 ─── */}
          <TabsContent value="sales">
            {submitted === "sales" ? (
              <SuccessCard label="売上" />
            ) : (
              <form onSubmit={handleSalesSubmit} className="space-y-4">
                {/* 日付 */}
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <Label>日付</Label>
                    <Input
                      type="date"
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-6"
                    onClick={fetchReservations}
                    disabled={reservationsLoading}
                  >
                    <RefreshCw size={14} className={reservationsLoading ? "animate-spin" : ""} />
                  </Button>
                </div>

                {/* 予約リスト */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">
                      本日の予約
                      <span className="ml-2 text-muted-foreground font-normal">
                        {completedCount}件
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {reservationsLoading ? (
                      <div className="text-center py-4 text-muted-foreground text-sm">読み込み中...</div>
                    ) : reservations.length === 0 ? (
                      <div className="text-center py-4 text-muted-foreground text-sm">予約がありません</div>
                    ) : (
                      <div className="space-y-2">
                        {reservations.map((r) => (
                          <div
                            key={r.id}
                            className={`flex items-center gap-3 p-3 rounded-lg border ${
                              r.status === "cancelled" ? "opacity-40 bg-muted/30" : "bg-background"
                            }`}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground w-10 shrink-0">{r.start_time?.slice(0, 5)}</span>
                                <span className="font-semibold text-sm truncate">{r.customer_name}</span>
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5 ml-12 truncate">{r.course_name}</p>
                            </div>
                            <div className="text-right shrink-0">
                              <div className="font-bold text-sm">¥{(r.price || 0).toLocaleString()}</div>
                              {r.status !== "cancelled" && (
                                <Select
                                  value={paymentEdits[r.id] || "cash"}
                                  onValueChange={(v) => handlePaymentChange(r.id, v)}
                                >
                                  <SelectTrigger className="h-6 text-xs mt-1 w-20 border-0 bg-muted/50 px-2">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {PAYMENT_METHODS.map((m) => (
                                      <SelectItem key={m.value} value={m.value} className="text-xs">
                                        {m.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              )}
                              {r.status === "cancelled" && (
                                <span className="text-xs text-muted-foreground">キャンセル</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* 集計 */}
                <Card className="bg-muted/30">
                  <CardContent className="pt-4 pb-4 space-y-2">
                    {[
                      { label: "現金", value: cashTotal },
                      { label: "カード", value: cardTotal },
                      { label: "PayPay", value: paypayTotal },
                    ].map(({ label, value }) => (
                      <div key={label} className="flex justify-between text-sm">
                        <span className="text-muted-foreground">{label}</span>
                        <span className="font-semibold">¥{value.toLocaleString()}</span>
                      </div>
                    ))}
                    {manualAdjustment !== 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">手動調整</span>
                        <span className="font-semibold">
                          {manualAdjustment > 0 ? "+" : ""}¥{manualAdjustment.toLocaleString()}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between border-t pt-2 mt-1">
                      <span className="font-bold">合計</span>
                      <span className="font-bold text-lg">¥{grandTotal.toLocaleString()}</span>
                    </div>
                  </CardContent>
                </Card>

                {/* 手動調整 */}
                <div>
                  <Label className="text-sm text-muted-foreground">手動調整額（差額・チップ等）</Label>
                  <Input
                    type="number"
                    step="100"
                    value={manualAdjustment}
                    onChange={(e) => setManualAdjustment(Number(e.target.value))}
                    placeholder="0"
                  />
                </div>

                <div>
                  <Label>備考</Label>
                  <Textarea value={salesNotes} onChange={(e) => setSalesNotes(e.target.value)} rows={2} />
                </div>

                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting ? "送信中..." : "売上を確定する"}
                </Button>
              </form>
            )}
          </TabsContent>

          {/* ─── 清掃チェック ─── */}
          <TabsContent value="cleaning">
            {submitted === "cleaning" ? (
              <SuccessCard label="清掃チェック" />
            ) : (
              <Card>
                <CardHeader><CardTitle>清掃チェック</CardTitle></CardHeader>
                <CardContent>
                  <form onSubmit={handleCleaningSubmit} className="space-y-3">
                    {[
                      { key: "room_cleaned", label: "ルーム清掃完了" },
                      { key: "supplies_stocked", label: "消耗品補充完了" },
                      { key: "trash_taken_out", label: "ゴミ出し完了" },
                      { key: "equipment_checked", label: "設備確認完了" },
                    ].map(({ key, label }) => (
                      <label key={key} className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-muted/30 transition-colors">
                        <input
                          type="checkbox"
                          checked={cleaning[key as keyof typeof cleaning] as boolean}
                          onChange={(e) => setCleaning({ ...cleaning, [key]: e.target.checked })}
                          className="h-5 w-5"
                        />
                        <span className="font-medium">{label}</span>
                      </label>
                    ))}
                    <div>
                      <Label>備考</Label>
                      <Textarea value={cleaning.notes} onChange={(e) => setCleaning({ ...cleaning, notes: e.target.value })} rows={2} />
                    </div>
                    <Button type="submit" className="w-full mt-2" disabled={submitting}>
                      {submitting ? "送信中..." : "チェックリストを送信"}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ─── フィードバック ─── */}
          <TabsContent value="feedback">
            {submitted === "feedback" ? (
              <SuccessCard label="フィードバック" />
            ) : (
              <Card>
                <CardHeader><CardTitle>フィードバック</CardTitle></CardHeader>
                <CardContent>
                  <form onSubmit={handleFeedbackSubmit} className="space-y-4">
                    <div>
                      <Label>今日の評価</Label>
                      <div className="flex gap-2 mt-2">
                        {[1, 2, 3, 4, 5].map((v) => (
                          <button
                            key={v}
                            type="button"
                            onClick={() => setFeedback({ ...feedback, rating: v })}
                            className={`w-12 h-12 rounded-full border-2 font-bold text-lg transition-colors ${
                              feedback.rating >= v
                                ? "bg-primary text-primary-foreground border-primary"
                                : "border-border hover:bg-muted/50"
                            }`}
                          >
                            {v}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <Label>良かった点</Label>
                      <Textarea value={feedback.good_points} onChange={(e) => setFeedback({ ...feedback, good_points: e.target.value })} rows={2} />
                    </div>
                    <div>
                      <Label>改善点</Label>
                      <Textarea value={feedback.improvement_points} onChange={(e) => setFeedback({ ...feedback, improvement_points: e.target.value })} rows={2} />
                    </div>
                    <div>
                      <Label>お客様の声</Label>
                      <Textarea value={feedback.customer_feedback} onChange={(e) => setFeedback({ ...feedback, customer_feedback: e.target.value })} rows={2} />
                    </div>
                    <Button type="submit" className="w-full" disabled={submitting}>
                      {submitting ? "送信中..." : "フィードバックを送信"}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
