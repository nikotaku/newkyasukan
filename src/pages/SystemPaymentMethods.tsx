import { useState, useEffect } from "react";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/Sidebar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { CreditCard } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface PaymentSetting {
  id: string;
  payment_method: string;
  payment_link: string | null;
  fee_percentage: number;
  // 予約案内ページ（/g/:token）に出すお客様向けの手順（1行に1つ）
  customer_guide: string | null;
}

type Draft = { payment_link: string; fee_percentage: string; customer_guide: string };

export default function SystemPaymentMethods() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settings, setSettings] = useState<PaymentSetting[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    if (!authLoading && !user) navigate("/login");
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) fetchSettings();
  }, [user]);

  const fetchSettings = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("payment_settings")
      .select("*")
      .order("payment_method");
    if (!error) {
      const rows = (data || []) as unknown as PaymentSetting[];
      setSettings(rows);
      const d: Record<string, Draft> = {};
      rows.forEach((p) => {
        d[p.id] = { payment_link: p.payment_link || "", fee_percentage: String(p.fee_percentage ?? 0), customer_guide: p.customer_guide || "" };
      });
      setDrafts(d);
    }
    setLoading(false);
  };

  const handleSave = async (id: string) => {
    const draft = drafts[id];
    if (!draft) return;
    const fee = parseFloat(draft.fee_percentage);
    if (isNaN(fee) || fee < 0 || fee > 100) {
      toast({ variant: "destructive", title: "エラー", description: "手数料は0〜100の数値で入力してください" });
      return;
    }
    setSavingId(id);
    const { error } = await supabase
      .from("payment_settings")
      .update({ payment_link: draft.payment_link || null, fee_percentage: fee, customer_guide: draft.customer_guide.trim() || null } as never)
      .eq("id", id);
    setSavingId(null);
    if (error) {
      toast({ variant: "destructive", title: "保存失敗", description: error.message });
      return;
    }
    toast({ title: "保存しました" });
    fetchSettings();
  };

  const updateDraft = (id: string, field: keyof Draft, val: string) => {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], [field]: val } }));
  };

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="pt-[60px] md:ml-[240px] p-6">
        <div className="max-w-3xl mx-auto">
          <div className="mb-6">
            <h1 className="text-2xl font-bold">決済方法</h1>
            <p className="text-muted-foreground">各決済方法の手数料（％）と決済リンクを設定。予約登録・Web予約フォームと連動します。</p>
          </div>

          {loading ? (
            <div className="text-center text-muted-foreground py-12">読み込み中...</div>
          ) : settings.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">決済方法がありません</CardContent></Card>
          ) : (
            <div className="space-y-4">
              {settings.map((s) => (
                <Card key={s.id}>
                  <CardContent className="pt-5 space-y-4">
                    <div className="flex items-center gap-2 font-semibold">
                      <CreditCard size={16} className="text-primary" />
                      {s.payment_method}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label className="text-xs">手数料（％）</Label>
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          step="0.1"
                          value={drafts[s.id]?.fee_percentage ?? ""}
                          onChange={(e) => updateDraft(s.id, "fee_percentage", e.target.value)}
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">決済リンク（予約案内ページのボタン）</Label>
                        <Input
                          placeholder="https://..."
                          value={drafts[s.id]?.payment_link ?? ""}
                          onChange={(e) => updateDraft(s.id, "payment_link", e.target.value)}
                          className="mt-1"
                        />
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs">お客様への支払い手順（予約案内ページに出す・1行に1つ）</Label>
                      <Textarea
                        rows={5}
                        placeholder={"例：\n下の「カード決済ページを開く」を押します\n決済ページでお支払い金額を入力します"}
                        value={drafts[s.id]?.customer_guide ?? ""}
                        onChange={(e) => updateDraft(s.id, "customer_guide", e.target.value)}
                        className="mt-1"
                      />
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        この決済方法で予約したお客様の案内ページ（SMSのリンク先）に、手数料込みの金額・この手順・決済リンクのボタンを出します。予約確認SMSには「リンクを開くと決済方法の案内が出ます」が入ります。
                      </p>
                    </div>
                    <div className="flex justify-end">
                      <Button onClick={() => handleSave(s.id)} disabled={savingId === s.id}>
                        {savingId === s.id ? "保存中..." : "保存"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
