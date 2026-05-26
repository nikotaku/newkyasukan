import { useState, useEffect } from "react";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/Sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface Discount {
  id: string;
  name: string;
  discount_type: "fixed" | "percentage";
  discount_value: number;
  is_active: boolean;
}

interface NominationRate {
  id: string;
  nomination_type: string;
  customer_price: number;
  therapist_back?: number;
}

export default function SystemDiscounts() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [discountLoading, setDiscountLoading] = useState(true);
  const [showDiscountForm, setShowDiscountForm] = useState(false);
  const [discountForm, setDiscountForm] = useState({
    name: "",
    discount_type: "fixed" as "fixed" | "percentage",
    discount_value: 0,
    is_active: true,
  });

  const [nominations, setNominations] = useState<NominationRate[]>([]);
  const [nomLoading, setNomLoading] = useState(true);
  const [showNomForm, setShowNomForm] = useState(false);
  const [nomForm, setNomForm] = useState({
    nomination_type: "",
    customer_price: 0,
    therapist_back: 0,
  });

  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !user) navigate("/login");
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) {
      fetchDiscounts();
      fetchNominations();
    }
  }, [user]);

  const fetchDiscounts = async () => {
    setDiscountLoading(true);
    try {
      const { data, error } = await supabase.from("discounts").select("*").order("name");
      if (error && error.code !== "PGRST116") throw error;
      setDiscounts(((data as any) || []) as Discount[]);
    } catch (error) {
      console.error("Error fetching discounts:", error);
    } finally {
      setDiscountLoading(false);
    }
  };

  const fetchNominations = async () => {
    setNomLoading(true);
    try {
      const { data, error } = await supabase
        .from("nomination_rates")
        .select("*")
        .order("customer_price");
      if (error && error.code !== "PGRST116") throw error;
      setNominations(data || []);
    } catch (error) {
      console.error("Error fetching nominations:", error);
    } finally {
      setNomLoading(false);
    }
  };

  const handleDiscountSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { error } = await supabase.from("discounts").insert([discountForm]);
      if (error) throw error;
      toast.success("追加しました");
      setDiscountForm({ name: "", discount_type: "fixed", discount_value: 0, is_active: true });
      setShowDiscountForm(false);
      fetchDiscounts();
    } catch (error) {
      console.error("Error adding discount:", error);
      toast.error("追加に失敗しました");
    }
  };

  const handleDiscountDelete = async (id: string) => {
    if (!confirm("削除しますか？")) return;
    try {
      const { error } = await supabase.from("discounts").delete().eq("id", id);
      if (error) throw error;
      toast.success("削除しました");
      fetchDiscounts();
    } catch (error) {
      console.error("Error deleting discount:", error);
      toast.error("削除に失敗しました");
    }
  };

  const handleNomSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nomForm.nomination_type.trim()) {
      toast.error("指名種別を入力してください");
      return;
    }
    try {
      const payload: any = {
        nomination_type: nomForm.nomination_type,
        customer_price: nomForm.customer_price,
      };
      if (nomForm.therapist_back > 0) payload.therapist_back = nomForm.therapist_back;
      const { error } = await supabase.from("nomination_rates").insert([payload]);
      if (error) throw error;
      toast.success("追加しました");
      setNomForm({ nomination_type: "", customer_price: 0, therapist_back: 0 });
      setShowNomForm(false);
      fetchNominations();
    } catch (error) {
      console.error("Error adding nomination:", error);
      toast.error("追加に失敗しました");
    }
  };

  const handleNomDelete = async (id: string) => {
    if (!confirm("削除しますか？")) return;
    try {
      const { error } = await supabase.from("nomination_rates").delete().eq("id", id);
      if (error) throw error;
      toast.success("削除しました");
      fetchNominations();
    } catch (error) {
      console.error("Error deleting nomination:", error);
      toast.error("削除に失敗しました");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="pt-[60px] md:ml-[240px] p-6">
        <div className="max-w-4xl mx-auto">
          <div className="mb-6">
            <h1 className="text-2xl font-bold">各種割引・指名料設定</h1>
            <p className="text-muted-foreground">指名料はフロントエンドの料金ページに反映されます</p>
          </div>

          <Tabs defaultValue="nominations">
            <TabsList className="mb-6">
              <TabsTrigger value="nominations">指名料</TabsTrigger>
              <TabsTrigger value="discounts">割引</TabsTrigger>
            </TabsList>

            {/* 指名料タブ */}
            <TabsContent value="nominations">
              <div className="flex justify-end mb-4">
                <Button onClick={() => setShowNomForm(!showNomForm)}>
                  <Plus size={16} className="mr-2" />追加
                </Button>
              </div>

              {showNomForm && (
                <Card className="mb-6">
                  <CardHeader><CardTitle>指名料を追加</CardTitle></CardHeader>
                  <CardContent>
                    <form onSubmit={handleNomSubmit} className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <Label>指名種別</Label>
                          <Input
                            value={nomForm.nomination_type}
                            onChange={(e) => setNomForm({ ...nomForm, nomination_type: e.target.value })}
                            placeholder="例：写真指名、本指名"
                            required
                          />
                        </div>
                        <div>
                          <Label>お客様料金（円）</Label>
                          <Input
                            type="number"
                            min="0"
                            value={nomForm.customer_price}
                            onChange={(e) => setNomForm({ ...nomForm, customer_price: Number(e.target.value) })}
                          />
                        </div>
                        <div>
                          <Label>セラピスト報酬（円）</Label>
                          <Input
                            type="number"
                            min="0"
                            value={nomForm.therapist_back}
                            onChange={(e) => setNomForm({ ...nomForm, therapist_back: Number(e.target.value) })}
                          />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button type="submit">保存</Button>
                        <Button type="button" variant="outline" onClick={() => setShowNomForm(false)}>キャンセル</Button>
                      </div>
                    </form>
                  </CardContent>
                </Card>
              )}

              {nomLoading ? (
                <div className="text-center text-muted-foreground">読み込み中...</div>
              ) : nominations.length === 0 ? (
                <Card><CardContent className="pt-12 pb-12 text-center text-muted-foreground">指名料がありません</CardContent></Card>
              ) : (
                <div className="space-y-2">
                  {nominations.map((nom) => (
                    <Card key={nom.id}>
                      <CardContent className="pt-4 pb-4">
                        <div className="flex items-center justify-between">
                          <div className="flex gap-6 text-sm">
                            <span className="font-semibold">{nom.nomination_type}</span>
                            <span>¥{nom.customer_price.toLocaleString()}</span>
                            {nom.therapist_back !== undefined && nom.therapist_back > 0 && (
                              <span className="text-muted-foreground">
                                バック ¥{nom.therapist_back.toLocaleString()}
                              </span>
                            )}
                          </div>
                          <Button size="sm" variant="ghost" onClick={() => handleNomDelete(nom.id)}>
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* 割引タブ */}
            <TabsContent value="discounts">
              <div className="flex justify-end mb-4">
                <Button onClick={() => setShowDiscountForm(!showDiscountForm)}>
                  <Plus size={16} className="mr-2" />追加
                </Button>
              </div>

              {showDiscountForm && (
                <Card className="mb-6">
                  <CardHeader><CardTitle>割引を追加</CardTitle></CardHeader>
                  <CardContent>
                    <form onSubmit={handleDiscountSubmit} className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <Label>割引名</Label>
                          <Input
                            value={discountForm.name}
                            onChange={(e) => setDiscountForm({ ...discountForm, name: e.target.value })}
                            required
                          />
                        </div>
                        <div>
                          <Label>種別</Label>
                          <Select
                            value={discountForm.discount_type}
                            onValueChange={(v: "fixed" | "percentage") =>
                              setDiscountForm({ ...discountForm, discount_type: v })
                            }
                          >
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="fixed">固定額</SelectItem>
                              <SelectItem value="percentage">割合（%）</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label>
                            {discountForm.discount_type === "fixed" ? "金額（円）" : "割合（%）"}
                          </Label>
                          <Input
                            type="number"
                            min="0"
                            value={discountForm.discount_value}
                            onChange={(e) =>
                              setDiscountForm({ ...discountForm, discount_value: Number(e.target.value) })
                            }
                          />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button type="submit">保存</Button>
                        <Button type="button" variant="outline" onClick={() => setShowDiscountForm(false)}>
                          キャンセル
                        </Button>
                      </div>
                    </form>
                  </CardContent>
                </Card>
              )}

              {discountLoading ? (
                <div className="text-center text-muted-foreground">読み込み中...</div>
              ) : discounts.length === 0 ? (
                <Card><CardContent className="pt-12 pb-12 text-center text-muted-foreground">割引がありません</CardContent></Card>
              ) : (
                <div className="space-y-2">
                  {discounts.map((d) => (
                    <Card key={d.id}>
                      <CardContent className="pt-4 pb-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-semibold text-sm">{d.name}</div>
                            <p className="text-xs text-muted-foreground">
                              {d.discount_type === "fixed"
                                ? `¥${(d.discount_value || 0).toLocaleString()} 引き`
                                : `${d.discount_value || 0}% 引き`}
                            </p>
                          </div>
                          <Button size="sm" variant="ghost" onClick={() => handleDiscountDelete(d.id)}>
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
}
