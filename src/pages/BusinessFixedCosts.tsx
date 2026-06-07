import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Search, Pencil, Trash2 } from "lucide-react";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/Sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

interface FixedCost {
  id: string;
  item_name: string;
  amount: number;
  payment_day: number | null;
  payment_method: string | null;
  transfer_destination: string | null;
  debit_account_id: string | null;
  renewal_date: string | null;
  cancellation_method: string | null;
  notes: string | null;
  vendor_id: string | null;
  vendor?: { id: string; name: string } | null;
  debit_account?: { id: string; account_name: string } | null;
  created_at: string;
}

interface Vendor { id: string; name: string; }
interface BankAccount { id: string; account_name: string; }

const emptyForm = {
  item_name: "",
  amount: 0,
  payment_day: "",
  payment_method: "",
  transfer_destination: "",
  debit_account_id: "",
  renewal_date: "",
  cancellation_method: "",
  notes: "",
  vendor_id: "",
};

export default function BusinessFixedCosts() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [fixedCosts, setFixedCosts] = useState<FixedCost[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });

  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    if (!authLoading && !user) navigate("/login");
  }, [user, authLoading]);

  useEffect(() => {
    if (user) {
      fetchFixedCosts();
      fetchVendors();
      fetchBankAccounts();
    }
  }, [user]);

  const fetchFixedCosts = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("business_fixed_costs" as any)
      .select("*, vendor:business_vendors(id,name), debit_account:business_bank_accounts(id,account_name)")
      .order("payment_day", { ascending: true, nullsFirst: false });
    if (!error && data) setFixedCosts(data as any);
    setLoading(false);
  };

  const fetchVendors = async () => {
    const { data } = await supabase.from("business_vendors" as any).select("id, name").order("name");
    if (data) setVendors(data as any);
  };

  const fetchBankAccounts = async () => {
    const { data } = await supabase.from("business_bank_accounts" as any).select("id, account_name").order("account_name");
    if (data) setBankAccounts(data as any);
  };

  const openAdd = () => {
    setEditingId(null);
    setForm({ ...emptyForm });
    setIsDialogOpen(true);
  };

  const openEdit = (c: FixedCost) => {
    setEditingId(c.id);
    setForm({
      item_name: c.item_name,
      amount: c.amount as any,
      payment_day: c.payment_day?.toString() || "",
      payment_method: c.payment_method || "",
      transfer_destination: c.transfer_destination || "",
      debit_account_id: c.debit_account_id || "",
      renewal_date: c.renewal_date || "",
      cancellation_method: c.cancellation_method || "",
      notes: c.notes || "",
      vendor_id: c.vendor_id || "",
    });
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.item_name.trim()) {
      toast({ title: "エラー", description: "項目名を入力してください", variant: "destructive" });
      return;
    }
    const payload = {
      item_name: form.item_name.trim(),
      amount: Number(form.amount) || 0,
      payment_day: form.payment_day ? Number(form.payment_day) : null,
      payment_method: form.payment_method || null,
      transfer_destination: form.transfer_destination || null,
      debit_account_id: form.debit_account_id || null,
      renewal_date: form.renewal_date || null,
      cancellation_method: form.cancellation_method || null,
      notes: form.notes || null,
      vendor_id: form.vendor_id || null,
      updated_at: new Date().toISOString(),
    };

    let error;
    if (editingId) {
      ({ error } = await supabase.from("business_fixed_costs" as any).update(payload).eq("id", editingId));
    } else {
      ({ error } = await supabase.from("business_fixed_costs" as any).insert([payload]));
    }

    if (error) {
      toast({ title: "エラー", description: "保存に失敗しました", variant: "destructive" });
      return;
    }
    toast({ title: editingId ? "更新完了" : "追加完了", description: `固定費を${editingId ? "更新" : "追加"}しました` });
    setIsDialogOpen(false);
    fetchFixedCosts();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("business_fixed_costs" as any).delete().eq("id", id);
    if (!error) {
      toast({ title: "削除完了", description: "固定費を削除しました" });
      fetchFixedCosts();
    }
  };

  const filtered = fixedCosts.filter((c) => {
    if (!searchTerm) return true;
    const q = searchTerm.toLowerCase();
    return (
      c.item_name.toLowerCase().includes(q) ||
      (c.vendor as any)?.name?.toLowerCase().includes(q) ||
      c.payment_method?.toLowerCase().includes(q)
    );
  });

  const monthlyTotal = filtered.reduce((sum, c) => sum + c.amount, 0);
  const yearlyTotal = monthlyTotal * 12;

  if (authLoading || loading) {
    return <div className="min-h-screen flex items-center justify-center"><div>読み込み中...</div></div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="pt-[60px] md:ml-[240px] p-6">
        <div className="max-w-6xl mx-auto space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">固定費管理</h1>
              <p className="text-sm text-muted-foreground">毎月の固定費一覧（支払日順）</p>
            </div>
            <Button size="sm" onClick={openAdd}><Plus size={16} className="mr-1" />固定費を追加</Button>
          </div>

          <Card>
            <CardContent className="p-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                <Input
                  placeholder="項目名・業者・支払方法で検索..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left px-4 py-3 font-medium">項目名</th>
                      <th className="text-right px-4 py-3 font-medium">金額</th>
                      <th className="text-left px-4 py-3 font-medium">支払日</th>
                      <th className="text-left px-4 py-3 font-medium">支払方法</th>
                      <th className="text-left px-4 py-3 font-medium">業者</th>
                      <th className="text-left px-4 py-3 font-medium">更新日</th>
                      <th className="text-right px-4 py-3 font-medium">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filtered.length === 0 ? (
                      <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">固定費が見つかりません</td></tr>
                    ) : (
                      filtered.map((c) => (
                        <tr key={c.id} className="hover:bg-accent/20 transition-colors">
                          <td className="px-4 py-3 font-medium">{c.item_name}</td>
                          <td className="px-4 py-3 text-right font-semibold">¥{c.amount.toLocaleString()}</td>
                          <td className="px-4 py-3">{c.payment_day ? `毎月${c.payment_day}日` : "—"}</td>
                          <td className="px-4 py-3">{c.payment_method || "—"}</td>
                          <td className="px-4 py-3">{(c.vendor as any)?.name || "—"}</td>
                          <td className="px-4 py-3">{c.renewal_date ? new Date(c.renewal_date).toLocaleDateString("ja-JP") : "—"}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(c)}>
                                <Pencil size={13} />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(c.id)}>
                                <Trash2 size={13} />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {filtered.length > 0 && (
                    <tfoot>
                      <tr className="border-t bg-muted/20 font-semibold">
                        <td className="px-4 py-3" colSpan={1}>合計 ({filtered.length}件)</td>
                        <td className="px-4 py-3 text-right text-primary">¥{monthlyTotal.toLocaleString()}<span className="text-xs font-normal text-muted-foreground ml-1">/月</span></td>
                        <td className="px-4 py-3 text-muted-foreground text-xs" colSpan={5}>年換算: ¥{yearlyTotal.toLocaleString()}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "固定費を編集" : "固定費を追加"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label>項目名 *</Label>
              <Input value={form.item_name} onChange={(e) => setForm({ ...form, item_name: e.target.value })} placeholder="家賃 / サーバー費 / 通信費" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>金額（月額）</Label>
                <Input type="number" value={form.amount || ""} onChange={(e) => setForm({ ...form, amount: e.target.value as any })} placeholder="0" />
              </div>
              <div>
                <Label>支払日（日）</Label>
                <Input type="number" min={1} max={31} value={form.payment_day} onChange={(e) => setForm({ ...form, payment_day: e.target.value })} placeholder="25" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>支払方法</Label>
                <Input value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value })} placeholder="口座振替 / カード / 振込" />
              </div>
              <div>
                <Label>振込先</Label>
                <Input value={form.transfer_destination} onChange={(e) => setForm({ ...form, transfer_destination: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>引落口座</Label>
              <Select value={form.debit_account_id || "__none__"} onValueChange={(v) => setForm({ ...form, debit_account_id: v === "__none__" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="なし" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">なし</SelectItem>
                  {bankAccounts.map((b) => <SelectItem key={b.id} value={b.id}>{b.account_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>関連業者</Label>
              <Select value={form.vendor_id || "__none__"} onValueChange={(v) => setForm({ ...form, vendor_id: v === "__none__" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="なし" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">なし</SelectItem>
                  {vendors.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>更新日</Label>
                <Input type="date" value={form.renewal_date} onChange={(e) => setForm({ ...form, renewal_date: e.target.value })} />
              </div>
              <div>
                <Label>解約方法</Label>
                <Input value={form.cancellation_method} onChange={(e) => setForm({ ...form, cancellation_method: e.target.value })} placeholder="電話 / WEB" />
              </div>
            </div>
            <div>
              <Label>備考</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} />
            </div>
            <Button onClick={handleSave} className="w-full">{editingId ? "更新" : "追加"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
