import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, ArrowLeft, CheckCircle } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ja } from "date-fns/locale";

interface Cast {
  id: string;
  name: string;
  photo: string | null;
}

export default function TherapistCheckout() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [cast, setCast] = useState<Cast | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<string | null>(null);

  const today = format(new Date(), "yyyy-MM-dd");

  const [salesData, setSalesData] = useState({
    date: today,
    cash_amount: 0,
    card_amount: 0,
    paypay_amount: 0,
    customer_count: 0,
    notes: "",
  });

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

  const handleSalesSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const { error } = await supabase.from("daily_sales_records").insert([{
        ...salesData,
        total_amount: salesData.cash_amount + salesData.card_amount + salesData.paypay_amount,
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
        date: today,
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
        date: today,
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
        <Button className="mt-4" variant="outline" onClick={() => setSubmitted(null)}>
          戻る
        </Button>
      </CardContent>
    </Card>
  );

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => navigate(`/therapist/${token}`)}>
              <ArrowLeft size={16} className="mr-1" />
              マイページ
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

          <TabsContent value="sales">
            {submitted === "sales" ? (
              <SuccessCard label="売上" />
            ) : (
              <Card>
                <CardHeader><CardTitle>売上入力</CardTitle></CardHeader>
                <CardContent>
                  <form onSubmit={handleSalesSubmit} className="space-y-4">
                    <div>
                      <Label>日付</Label>
                      <Input type="date" value={salesData.date} onChange={(e) => setSalesData({ ...salesData, date: e.target.value })} />
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <Label>現金</Label>
                        <Input type="number" min="0" step="100" value={salesData.cash_amount} onChange={(e) => setSalesData({ ...salesData, cash_amount: Number(e.target.value) })} />
                      </div>
                      <div>
                        <Label>カード</Label>
                        <Input type="number" min="0" step="100" value={salesData.card_amount} onChange={(e) => setSalesData({ ...salesData, card_amount: Number(e.target.value) })} />
                      </div>
                      <div>
                        <Label>PayPay</Label>
                        <Input type="number" min="0" step="100" value={salesData.paypay_amount} onChange={(e) => setSalesData({ ...salesData, paypay_amount: Number(e.target.value) })} />
                      </div>
                    </div>
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <span className="text-sm text-muted-foreground">合計</span>
                      <div className="text-2xl font-bold">
                        ¥{(salesData.cash_amount + salesData.card_amount + salesData.paypay_amount).toLocaleString()}
                      </div>
                    </div>
                    <div>
                      <Label>来客数</Label>
                      <Input type="number" min="0" value={salesData.customer_count} onChange={(e) => setSalesData({ ...salesData, customer_count: Number(e.target.value) })} />
                    </div>
                    <div>
                      <Label>備考</Label>
                      <Textarea value={salesData.notes} onChange={(e) => setSalesData({ ...salesData, notes: e.target.value })} rows={2} />
                    </div>
                    <Button type="submit" className="w-full" disabled={submitting}>
                      {submitting ? "送信中..." : "売上を記録する"}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            )}
          </TabsContent>

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
