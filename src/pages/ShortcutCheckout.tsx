import { useState } from "react";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/Sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { CheckCircle } from "lucide-react";

export default function ShortcutCheckout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [submitted, setSubmitted] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [salesData, setSalesData] = useState({
    date: format(new Date(), "yyyy-MM-dd"),
    cash_amount: 0,
    card_amount: 0,
    paypay_amount: 0,
    customer_count: 0,
    notes: "",
  });

  const [cleaningData, setCleaningData] = useState({
    room_cleaned: false,
    supplies_stocked: false,
    trash_taken_out: false,
    equipment_checked: false,
    notes: "",
  });

  const [feedbackData, setFeedbackData] = useState({
    rating: 5,
    good_points: "",
    improvement_points: "",
    customer_feedback: "",
  });

  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  useState(() => {
    if (!authLoading && !user) navigate("/login");
  });

  const handleSalesSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.from("daily_sales_records").insert([{
        ...salesData,
        total_amount: salesData.cash_amount + salesData.card_amount + salesData.paypay_amount,
        submitted_by: user?.id,
      }]);
      if (error) throw error;
      setSubmitted("sales");
    } catch (error) {
      console.error("Error submitting sales:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCleaningSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.from("cleaning_checklists").insert([{
        ...cleaningData,
        date: format(new Date(), "yyyy-MM-dd"),
        submitted_by: user?.id,
      }]);
      if (error) throw error;
      setSubmitted("cleaning");
    } catch (error) {
      console.error("Error submitting cleaning:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleFeedbackSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.from("daily_feedback").insert([{
        ...feedbackData,
        date: format(new Date(), "yyyy-MM-dd"),
        submitted_by: user?.id,
      }]);
      if (error) throw error;
      setSubmitted("feedback");
    } catch (error) {
      console.error("Error submitting feedback:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="pt-[60px] md:ml-[240px] p-6">
        <div className="max-w-2xl mx-auto">
          <div className="mb-6">
            <h1 className="text-2xl font-bold">退勤フォーム</h1>
            <p className="text-muted-foreground">
              {format(new Date(), "yyyy年MM月dd日（E）", { locale: ja })}
            </p>
          </div>

          <Tabs defaultValue="sales">
            <TabsList className="w-full mb-6">
              <TabsTrigger value="sales" className="flex-1">売上入力</TabsTrigger>
              <TabsTrigger value="cleaning" className="flex-1">清掃チェック</TabsTrigger>
              <TabsTrigger value="feedback" className="flex-1">フィードバック</TabsTrigger>
            </TabsList>

            <TabsContent value="sales">
              {submitted === "sales" ? (
                <Card>
                  <CardContent className="pt-12 pb-12 text-center">
                    <CheckCircle className="mx-auto mb-3 text-green-500" size={48} />
                    <p className="font-semibold">売上を記録しました</p>
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardHeader><CardTitle>売上入力</CardTitle></CardHeader>
                  <CardContent>
                    <form onSubmit={handleSalesSubmit} className="space-y-4">
                      <div>
                        <Label>日付</Label>
                        <Input type="date" value={salesData.date} onChange={(e) => setSalesData({ ...salesData, date: e.target.value })} />
                      </div>
                      <div className="grid grid-cols-3 gap-4">
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
                      <div>
                        <Label>合計</Label>
                        <div className="text-2xl font-bold mt-1">
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
                      <Button type="submit" className="w-full" disabled={loading}>
                        {loading ? "送信中..." : "売上を記録する"}
                      </Button>
                    </form>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="cleaning">
              {submitted === "cleaning" ? (
                <Card>
                  <CardContent className="pt-12 pb-12 text-center">
                    <CheckCircle className="mx-auto mb-3 text-green-500" size={48} />
                    <p className="font-semibold">清掃チェックを記録しました</p>
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardHeader><CardTitle>清掃チェック</CardTitle></CardHeader>
                  <CardContent>
                    <form onSubmit={handleCleaningSubmit} className="space-y-4">
                      {[
                        { key: "room_cleaned", label: "ルーム清掃完了" },
                        { key: "supplies_stocked", label: "消耗品補充完了" },
                        { key: "trash_taken_out", label: "ゴミ出し完了" },
                        { key: "equipment_checked", label: "設備確認完了" },
                      ].map(({ key, label }) => (
                        <div key={key} className="flex items-center gap-3 p-3 border rounded-lg">
                          <input
                            type="checkbox"
                            id={key}
                            checked={cleaningData[key as keyof typeof cleaningData] as boolean}
                            onChange={(e) => setCleaningData({ ...cleaningData, [key]: e.target.checked })}
                            className="h-4 w-4"
                          />
                          <label htmlFor={key} className="font-medium cursor-pointer">{label}</label>
                        </div>
                      ))}
                      <div>
                        <Label>備考</Label>
                        <Textarea value={cleaningData.notes} onChange={(e) => setCleaningData({ ...cleaningData, notes: e.target.value })} rows={2} />
                      </div>
                      <Button type="submit" className="w-full" disabled={loading}>
                        {loading ? "送信中..." : "チェックリストを送信"}
                      </Button>
                    </form>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="feedback">
              {submitted === "feedback" ? (
                <Card>
                  <CardContent className="pt-12 pb-12 text-center">
                    <CheckCircle className="mx-auto mb-3 text-green-500" size={48} />
                    <p className="font-semibold">フィードバックを送信しました</p>
                  </CardContent>
                </Card>
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
                              onClick={() => setFeedbackData({ ...feedbackData, rating: v })}
                              className={`w-10 h-10 rounded-full border-2 font-semibold transition-colors ${
                                feedbackData.rating >= v ? "bg-primary text-primary-foreground border-primary" : "border-border"
                              }`}
                            >
                              {v}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <Label>良かった点</Label>
                        <Textarea value={feedbackData.good_points} onChange={(e) => setFeedbackData({ ...feedbackData, good_points: e.target.value })} rows={2} />
                      </div>
                      <div>
                        <Label>改善点</Label>
                        <Textarea value={feedbackData.improvement_points} onChange={(e) => setFeedbackData({ ...feedbackData, improvement_points: e.target.value })} rows={2} />
                      </div>
                      <div>
                        <Label>お客様の声</Label>
                        <Textarea value={feedbackData.customer_feedback} onChange={(e) => setFeedbackData({ ...feedbackData, customer_feedback: e.target.value })} rows={2} />
                      </div>
                      <Button type="submit" className="w-full" disabled={loading}>
                        {loading ? "送信中..." : "フィードバックを送信"}
                      </Button>
                    </form>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
}
