import { useState, useEffect } from "react";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/Sidebar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO } from "date-fns";
import { ja } from "date-fns/locale";
import { Plus, X, Send, CheckCircle, Clock } from "lucide-react";
import { toast } from "sonner";

interface Deduction {
  id: string;
  name: string;
  amount: number;
  rule: string | null;
}

interface DeductionItem {
  name: string;
  rule: string;
  amount: number;
}

interface ClearanceReport {
  id: string;
  cast_id: string;
  report_date: string;
  orders_detail: string;
  status: "pending" | "reviewed";
  deduction_items: DeductionItem[];
  total_deduction: number;
  admin_note: string | null;
  created_at: string;
  casts: { name: string; photo: string | null } | null;
}

export default function SalesClearanceReports() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [reports, setReports] = useState<ClearanceReport[]>([]);
  const [deductionMaster, setDeductionMaster] = useState<Deduction[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ClearanceReport | null>(null);
  const [items, setItems] = useState<DeductionItem[]>([]);
  const [adminNote, setAdminNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !user) navigate("/login");
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) {
      fetchReports();
      fetchDeductionMaster();
    }
  }, [user]);

  const fetchReports = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("therapist_clearance_reports")
      .select("*, casts(name, photo)")
      .order("created_at", { ascending: false });
    setReports((data || []) as ClearanceReport[]);
    setLoading(false);
  };

  const fetchDeductionMaster = async () => {
    const { data } = await supabase.from("deductions").select("id, name, amount, rule").eq("is_active", true).order("name");
    setDeductionMaster(data || []);
  };

  const openReport = (r: ClearanceReport) => {
    setSelected(r);
    setItems(r.deduction_items || []);
    setAdminNote(r.admin_note || "");
  };

  const addItem = (d?: Deduction) => {
    setItems((prev) => [...prev, { name: d?.name || "", rule: d?.rule || "", amount: d?.amount || 0 }]);
  };

  const updateItem = (i: number, field: keyof DeductionItem, val: string | number) => {
    setItems((prev) => prev.map((x, idx) => (idx === i ? { ...x, [field]: val } : x)));
  };

  const removeItem = (i: number) => setItems((prev) => prev.filter((_, idx) => idx !== i));

  const totalDeduction = items.reduce((s, x) => s + (Number(x.amount) || 0), 0);

  const handleSend = async () => {
    if (!selected) return;
    setSubmitting(true);
    try {
      const { error } = await supabase
        .from("therapist_clearance_reports")
        .update({
          status: "reviewed",
          deduction_items: items,
          total_deduction: totalDeduction,
          admin_note: adminNote || null,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", selected.id);
      if (error) throw error;
      toast.success("精算結果を送信しました");
      setSelected(null);
      fetchReports();
    } catch (e: any) {
      toast.error(e?.message || "送信に失敗しました");
    } finally {
      setSubmitting(false);
    }
  };

  const pending = reports.filter((r) => r.status === "pending");
  const reviewed = reports.filter((r) => r.status === "reviewed");

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="pt-[60px] md:ml-[240px] p-6">
        <div className="max-w-5xl mx-auto">
          <div className="mb-6 flex items-center gap-3">
            <h1 className="text-2xl font-bold">精算管理</h1>
            {pending.length > 0 && (
              <Badge className="bg-red-500 text-white">{pending.length}件 未処理</Badge>
            )}
          </div>

          {loading ? (
            <div className="text-center text-muted-foreground py-12">読み込み中...</div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Report list */}
              <div className="space-y-3">
                {pending.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-red-600 mb-2 uppercase tracking-wider">未処理</p>
                    {pending.map((r) => (
                      <ReportCard key={r.id} report={r} selected={selected?.id === r.id} onClick={() => openReport(r)} />
                    ))}
                  </div>
                )}
                {reviewed.length > 0 && (
                  <div className="mt-4">
                    <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">処理済み</p>
                    {reviewed.map((r) => (
                      <ReportCard key={r.id} report={r} selected={selected?.id === r.id} onClick={() => openReport(r)} />
                    ))}
                  </div>
                )}
                {reports.length === 0 && (
                  <Card><CardContent className="py-12 text-center text-muted-foreground">精算報告はありません</CardContent></Card>
                )}
              </div>

              {/* Detail / edit panel */}
              {selected && (
                <Card className="h-fit">
                  <CardContent className="pt-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-muted-foreground">{selected.casts?.name}</p>
                        <p className="font-semibold">{format(parseISO(selected.report_date), "M月d日(E)", { locale: ja })}</p>
                      </div>
                      {selected.status === "reviewed" && (
                        <Badge className="bg-green-600 text-xs"><CheckCircle size={10} className="mr-1" />処理済み</Badge>
                      )}
                    </div>

                    <div>
                      <Label className="text-xs text-muted-foreground">セラピストの報告内容</Label>
                      <div className="mt-1 text-sm bg-muted/40 rounded p-3 whitespace-pre-wrap">{selected.orders_detail}</div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-semibold">控除項目</Label>
                        <div className="flex gap-1 flex-wrap justify-end">
                          {deductionMaster.map((d) => (
                            <button key={d.id} type="button"
                              className="text-xs border rounded px-2 py-0.5 hover:bg-muted/50 text-muted-foreground"
                              onClick={() => addItem(d)}>
                              + {d.name}
                            </button>
                          ))}
                          <button type="button"
                            className="text-xs border rounded px-2 py-0.5 hover:bg-muted/50 text-muted-foreground"
                            onClick={() => addItem()}>
                            + カスタム
                          </button>
                        </div>
                      </div>

                      {items.map((item, i) => (
                        <div key={i} className="border rounded p-2 space-y-1.5 bg-muted/20">
                          <div className="flex gap-2 items-center">
                            <Input
                              placeholder="控除名"
                              value={item.name}
                              onChange={(e) => updateItem(i, "name", e.target.value)}
                              className="h-7 text-xs flex-1"
                            />
                            <Input
                              type="number"
                              placeholder="金額"
                              value={item.amount || ""}
                              onChange={(e) => updateItem(i, "amount", Number(e.target.value))}
                              className="h-7 text-xs w-24"
                            />
                            <button type="button" onClick={() => removeItem(i)}>
                              <X size={14} className="text-muted-foreground hover:text-destructive" />
                            </button>
                          </div>
                          <Input
                            placeholder="ルール・備考（任意）"
                            value={item.rule}
                            onChange={(e) => updateItem(i, "rule", e.target.value)}
                            className="h-7 text-xs"
                          />
                        </div>
                      ))}

                      {items.length > 0 && (
                        <div className="flex justify-between text-sm font-semibold pt-1 border-t">
                          <span>控除合計</span>
                          <span className="text-red-600">-¥{totalDeduction.toLocaleString()}</span>
                        </div>
                      )}
                    </div>

                    <div>
                      <Label className="text-xs">管理者メモ（セラピストに通知）</Label>
                      <Textarea
                        placeholder="例: 雑費2本で¥2000控除しました"
                        value={adminNote}
                        onChange={(e) => setAdminNote(e.target.value)}
                        rows={2}
                        className="mt-1 text-sm"
                      />
                    </div>

                    <Button onClick={handleSend} disabled={submitting} className="w-full">
                      <Send size={14} className="mr-1.5" />
                      {submitting ? "送信中..." : "精算結果を送信"}
                    </Button>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function ReportCard({ report, selected, onClick }: { report: ClearanceReport; selected: boolean; onClick: () => void }) {
  return (
    <Card
      className={`mb-2 cursor-pointer transition-colors ${selected ? "border-primary bg-primary/5" : "hover:bg-muted/30"}`}
      onClick={onClick}
    >
      <CardContent className="py-3 px-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {report.casts?.photo ? (
              <img src={report.casts.photo} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />
            ) : (
              <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-xs shrink-0">
                {report.casts?.name?.charAt(0)}
              </div>
            )}
            <div>
              <p className="text-sm font-medium">{report.casts?.name}</p>
              <p className="text-xs text-muted-foreground">
                {format(parseISO(report.report_date), "M/d(E)", { locale: ja })} ·{" "}
                {format(parseISO(report.created_at), "HH:mm")}
              </p>
            </div>
          </div>
          {report.status === "pending" ? (
            <Badge variant="outline" className="text-xs text-orange-600 border-orange-300 gap-1">
              <Clock size={10} />未処理
            </Badge>
          ) : (
            <Badge variant="outline" className="text-xs text-green-600 border-green-300 gap-1">
              <CheckCircle size={10} />処理済
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-1.5 line-clamp-1">{report.orders_detail}</p>
      </CardContent>
    </Card>
  );
}
