import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Search, Pencil, Trash2, ExternalLink, AlertTriangle, GripVertical } from "lucide-react";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/Sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useSortable } from "@/hooks/useSortable";
import { useDragReorder } from "@/hooks/useDragReorder";
import { SortableTh } from "@/components/SortableTh";

interface Contract {
  id: string;
  contract_name: string;
  counterparty: string | null;
  start_date: string | null;
  renewal_date: string | null;
  cancellation_deadline: string | null;
  file_url: string | null;
  notes: string | null;
  vendor_id: string | null;
  vendor?: { id: string; name: string } | null;
  sort_order: number | null;
  created_at: string;
}

interface Vendor { id: string; name: string; }

const emptyForm = {
  contract_name: "",
  counterparty: "",
  start_date: "",
  renewal_date: "",
  cancellation_deadline: "",
  file_url: "",
  notes: "",
  vendor_id: "",
};

function getDaysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const diff = new Date(dateStr).getTime() - new Date().getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function getDateUrgency(dateStr: string | null): "danger" | "warning" | "normal" {
  const days = getDaysUntil(dateStr);
  if (days === null) return "normal";
  if (days <= 30 && days >= 0) return "danger";
  if (days <= 60 && days >= 0) return "warning";
  return "normal";
}

export default function BusinessContracts() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterUrgency, setFilterUrgency] = useState("all");
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
      fetchContracts();
      fetchVendors();
    }
  }, [user]);

  const fetchContracts = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("business_contracts" as any)
      .select("*, vendor:business_vendors(id,name)")
      .order("sort_order", { ascending: true, nullsFirst: false });
    if (!error && data) setContracts(data as any);
    setLoading(false);
  };

  const fetchVendors = async () => {
    const { data } = await supabase.from("business_vendors" as any).select("id, name").order("name");
    if (data) setVendors(data as any);
  };

  const openAdd = () => {
    setEditingId(null);
    setForm({ ...emptyForm });
    setIsDialogOpen(true);
  };

  const openEdit = (c: Contract) => {
    setEditingId(c.id);
    setForm({
      contract_name: c.contract_name,
      counterparty: c.counterparty || "",
      start_date: c.start_date || "",
      renewal_date: c.renewal_date || "",
      cancellation_deadline: c.cancellation_deadline || "",
      file_url: c.file_url || "",
      notes: c.notes || "",
      vendor_id: c.vendor_id || "",
    });
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.contract_name.trim()) {
      toast({ title: "エラー", description: "契約名を入力してください", variant: "destructive" });
      return;
    }
    const payload = {
      contract_name: form.contract_name.trim(),
      counterparty: form.counterparty || null,
      start_date: form.start_date || null,
      renewal_date: form.renewal_date || null,
      cancellation_deadline: form.cancellation_deadline || null,
      file_url: form.file_url || null,
      notes: form.notes || null,
      vendor_id: form.vendor_id || null,
      updated_at: new Date().toISOString(),
    };

    let error;
    if (editingId) {
      ({ error } = await supabase.from("business_contracts" as any).update(payload).eq("id", editingId));
    } else {
      ({ error } = await supabase.from("business_contracts" as any).insert([payload]));
    }

    if (error) {
      toast({ title: "エラー", description: "保存に失敗しました", variant: "destructive" });
      return;
    }
    toast({ title: editingId ? "更新完了" : "追加完了", description: `契約書を${editingId ? "更新" : "追加"}しました` });
    setIsDialogOpen(false);
    fetchContracts();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("business_contracts" as any).delete().eq("id", id);
    if (!error) {
      toast({ title: "削除完了", description: "契約書を削除しました" });
      fetchContracts();
    }
  };

  const filtered = contracts.filter((c) => {
    const matchSearch = !searchTerm ||
      c.contract_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.counterparty?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.vendor as any)?.name?.toLowerCase().includes(searchTerm.toLowerCase());
    const renewalUrgency = getDateUrgency(c.renewal_date);
    const deadlineUrgency = getDateUrgency(c.cancellation_deadline);
    const matchUrgency = filterUrgency === "all" ||
      (filterUrgency === "urgent" && (renewalUrgency === "danger" || deadlineUrgency === "danger"));
    return matchSearch && matchUrgency;
  });

  const sort = useSortable<Contract>(filtered, {
    contract_name: (c) => c.contract_name,
    counterparty: (c) => c.counterparty,
    start_date: (c) => c.start_date,
    renewal_date: (c) => c.renewal_date,
    cancellation_deadline: (c) => c.cancellation_deadline,
  });
  const displayed = sort.sorted;

  const persistOrder = async (ordered: Contract[]) => {
    const orderMap = new Map(ordered.map((c, i) => [c.id, i]));
    setContracts((prev) => [...prev].sort((a, b) => (orderMap.get(a.id) ?? 1e9) - (orderMap.get(b.id) ?? 1e9)));
    sort.reset();
    await Promise.all(ordered.map((c, i) => supabase.from("business_contracts" as any).update({ sort_order: i + 1 }).eq("id", c.id)));
    fetchContracts();
  };

  const { rowProps } = useDragReorder<Contract>(displayed, persistOrder);

  const renderDateBadge = (dateStr: string | null) => {
    if (!dateStr) return <span className="text-muted-foreground">—</span>;
    const urgency = getDateUrgency(dateStr);
    const days = getDaysUntil(dateStr);
    const dateLabel = new Date(dateStr).toLocaleDateString("ja-JP");
    if (urgency === "danger") {
      return (
        <Badge variant="destructive" className="flex items-center gap-1 whitespace-nowrap">
          <AlertTriangle size={10} />
          {dateLabel}
          {days !== null && days >= 0 && <span>({days}日後)</span>}
        </Badge>
      );
    }
    if (urgency === "warning") {
      return <Badge variant="secondary" className="bg-orange-100 text-orange-700 border-orange-300 whitespace-nowrap">{dateLabel}</Badge>;
    }
    return <span className="text-sm">{dateLabel}</span>;
  };

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
              <h1 className="text-2xl font-bold">契約書管理</h1>
              <p className="text-sm text-muted-foreground">契約書・更新日・解約期限の管理</p>
            </div>
            <Button size="sm" onClick={openAdd}><Plus size={16} className="mr-1" />契約を追加</Button>
          </div>

          <Card>
            <CardContent className="p-4">
              <div className="flex gap-3 flex-wrap">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                  <Input
                    placeholder="契約名・契約先で検索..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <Select value={filterUrgency} onValueChange={setFilterUrgency}>
                  <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全契約</SelectItem>
                    <SelectItem value="urgent">期限30日以内のみ</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="w-8 px-2 py-3"></th>
                      <SortableTh label="契約名" sortKey="contract_name" activeKey={sort.sortKey} dir={sort.sortDir} onSort={sort.toggle} />
                      <SortableTh label="契約先" sortKey="counterparty" activeKey={sort.sortKey} dir={sort.sortDir} onSort={sort.toggle} />
                      <SortableTh label="開始日" sortKey="start_date" activeKey={sort.sortKey} dir={sort.sortDir} onSort={sort.toggle} />
                      <SortableTh label="更新日" sortKey="renewal_date" activeKey={sort.sortKey} dir={sort.sortDir} onSort={sort.toggle} />
                      <SortableTh label="解約期限" sortKey="cancellation_deadline" activeKey={sort.sortKey} dir={sort.sortDir} onSort={sort.toggle} />
                      <th className="text-left px-4 py-3 font-medium">ファイル</th>
                      <th className="text-right px-4 py-3 font-medium">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {displayed.length === 0 ? (
                      <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">契約書が見つかりません</td></tr>
                    ) : (
                      displayed.map((c, index) => {
                        const renewalUrgency = getDateUrgency(c.renewal_date);
                        const deadlineUrgency = getDateUrgency(c.cancellation_deadline);
                        const rowHighlight = renewalUrgency === "danger" || deadlineUrgency === "danger";
                        return (
                          <tr key={c.id} {...rowProps(index)} className={`hover:bg-accent/20 transition-colors data-[over=true]:border-t-2 data-[over=true]:border-primary data-[dragging=true]:opacity-40 ${rowHighlight ? "bg-red-50/50" : ""}`}>
                            <td className="px-2 py-3 text-muted-foreground cursor-grab active:cursor-grabbing"><GripVertical size={14} /></td>
                            <td className="px-4 py-3 font-medium">{c.contract_name}</td>
                            <td className="px-4 py-3">{c.counterparty || "—"}</td>
                            <td className="px-4 py-3">{c.start_date ? new Date(c.start_date).toLocaleDateString("ja-JP") : "—"}</td>
                            <td className="px-4 py-3">{renderDateBadge(c.renewal_date)}</td>
                            <td className="px-4 py-3">{renderDateBadge(c.cancellation_deadline)}</td>
                            <td className="px-4 py-3">
                              {c.file_url ? (
                                <a href={c.file_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1 text-xs">
                                  開く <ExternalLink size={11} />
                                </a>
                              ) : "—"}
                            </td>
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
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "契約書を編集" : "契約書を追加"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label>契約名 *</Label>
              <Input value={form.contract_name} onChange={(e) => setForm({ ...form, contract_name: e.target.value })} placeholder="賃貸借契約 / サーバー契約" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>契約先</Label>
                <Input value={form.counterparty} onChange={(e) => setForm({ ...form, counterparty: e.target.value })} />
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
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>開始日</Label>
                <Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
              </div>
              <div>
                <Label>更新日</Label>
                <Input type="date" value={form.renewal_date} onChange={(e) => setForm({ ...form, renewal_date: e.target.value })} />
              </div>
              <div>
                <Label>解約期限</Label>
                <Input type="date" value={form.cancellation_deadline} onChange={(e) => setForm({ ...form, cancellation_deadline: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>ファイルURL</Label>
              <Input type="url" value={form.file_url} onChange={(e) => setForm({ ...form, file_url: e.target.value })} placeholder="https://drive.google.com/..." />
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
