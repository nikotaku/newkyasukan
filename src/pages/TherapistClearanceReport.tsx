import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Send, CheckCircle, Clock } from "lucide-react";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { ja } from "date-fns/locale";

interface Cast {
  id: string;
  name: string;
}

interface ClearanceReport {
  id: string;
  report_date: string;
  orders_detail: string;
  status: "pending" | "reviewed";
  deduction_items: { name: string; rule?: string; amount: number }[];
  total_deduction: number;
  admin_note: string | null;
  created_at: string;
}

export default function TherapistClearanceReport() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [cast, setCast] = useState<Cast | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [reports, setReports] = useState<ClearanceReport[]>([]);

  const [form, setForm] = useState({
    report_date: format(new Date(), "yyyy-MM-dd"),
    orders_detail: "",
  });

  useEffect(() => {
    if (!token) { navigate("/"); return; }
    const fetchCast = async () => {
      try {
        const { data } = await supabase.rpc("get_cast_by_access_token", { p_token: token });
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

  useEffect(() => {
    if (cast) fetchReports();
  }, [cast]);

  const fetchReports = async () => {
    if (!cast) return;
    const { data } = await supabase
      .from("therapist_clearance_reports")
      .select("*")
      .eq("cast_id", cast.id)
      .order("created_at", { ascending: false })
      .limit(20);
    setReports((data || []) as ClearanceReport[]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cast || !form.orders_detail.trim()) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.from("therapist_clearance_reports").insert([{
        cast_id: cast.id,
        report_date: form.report_date,
        orders_detail: form.orders_detail.trim(),
      }]);
      if (error) throw error;
      toast.success("精算報告を送信しました");
      setForm({ report_date: format(new Date(), "yyyy-MM-dd"), orders_detail: "" });
      fetchReports();
    } catch (e: any) {
      toast.error(e?.message || "送信に失敗しました");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">読み込み中...</div>;

  return (
    <div className="min-h-screen bg-background pb-10">
      <div className="bg-card border-b px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate(`/therapist/${token}`)}>
          <ArrowLeft size={16} />
        </Button>
        <div>
          <p className="text-xs text-muted-foreground">{cast?.name}</p>
          <h1 className="font-bold text-sm">精算報告</h1>
        </div>
      </div>

      <div className="max-w-xl mx-auto px-4 py-6 space-y-6">
        {/* Submit form */}
        <Card>
          <CardContent className="pt-5">
            <h2 className="font-semibold mb-4">新しい精算報告を送信</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label>日付</Label>
                <Input
                  type="date"
                  value={form.report_date}
                  onChange={(e) => setForm({ ...form, report_date: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>オーダー内容・使用備品など</Label>
                <Textarea
                  placeholder={`例:\n・タオル 3本使用\n・アメニティ 2セット\n・宿泊あり\n・オプション: ○○コース追加`}
                  value={form.orders_detail}
                  onChange={(e) => setForm({ ...form, orders_detail: e.target.value })}
                  rows={6}
                  className="mt-1"
                  required
                />
              </div>
              <Button type="submit" disabled={submitting || !form.orders_detail.trim()} className="w-full">
                <Send size={14} className="mr-1.5" />
                {submitting ? "送信中..." : "送信する"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Past reports */}
        {reports.length > 0 && (
          <div>
            <h2 className="font-semibold mb-3 text-sm text-muted-foreground">過去の精算報告</h2>
            <div className="space-y-3">
              {reports.map((r) => (
                <Card key={r.id} className={r.status === "reviewed" ? "border-green-200 bg-green-50/30" : ""}>
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-semibold">
                        {format(parseISO(r.report_date), "M月d日(E)", { locale: ja })}
                      </span>
                      {r.status === "pending" ? (
                        <Badge variant="outline" className="text-xs gap-1">
                          <Clock size={10} />確認待ち
                        </Badge>
                      ) : (
                        <Badge className="text-xs bg-green-600 gap-1">
                          <CheckCircle size={10} />確認済み
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground whitespace-pre-wrap">{r.orders_detail}</p>

                    {r.status === "reviewed" && (
                      <div className="mt-3 pt-3 border-t space-y-1">
                        {(r.deduction_items || []).map((item, i) => (
                          <div key={i} className="flex justify-between text-xs">
                            <span className="text-muted-foreground">{item.name}{item.rule ? ` (${item.rule})` : ""}</span>
                            <span className="font-medium text-red-600">-¥{item.amount.toLocaleString()}</span>
                          </div>
                        ))}
                        {r.total_deduction > 0 && (
                          <div className="flex justify-between text-sm font-semibold pt-1 border-t">
                            <span>控除合計</span>
                            <span className="text-red-600">-¥{r.total_deduction.toLocaleString()}</span>
                          </div>
                        )}
                        {r.admin_note && (
                          <p className="text-xs text-muted-foreground mt-2 bg-muted/50 rounded p-2">{r.admin_note}</p>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
