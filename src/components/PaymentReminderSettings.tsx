import { useState, useEffect } from "react";
import { Bell, Plus, Trash2, Pencil, X, Check } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface PaymentReminder {
  id: string;
  title: string;
  amount: number;
  day_of_month: number;
  memo: string | null;
  active: boolean;
}

const EMPTY: Omit<PaymentReminder, "id"> = {
  title: "",
  amount: 0,
  day_of_month: 1,
  memo: "",
  active: true,
};

export function PaymentReminderSettings() {
  const { toast } = useToast();
  const [reminders, setReminders] = useState<PaymentReminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Omit<PaymentReminder, "id">>(EMPTY);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchReminders();
  }, []);

  const fetchReminders = async () => {
    setLoading(true);
    const { data } = await (supabase as any).from("payment_reminders").select("*").order("day_of_month");
    if (data) setReminders(data);
    setLoading(false);
  };

  const openAdd = () => {
    setEditingId(null);
    setForm(EMPTY);
    setShowForm(true);
  };

  const openEdit = (r: PaymentReminder) => {
    setEditingId(r.id);
    setForm({ title: r.title, amount: r.amount, day_of_month: r.day_of_month, memo: r.memo, active: r.active });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.title.trim()) {
      toast({ title: "タイトルを入力してください", variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload = {
      title: form.title.trim(),
      amount: Number(form.amount) || 0,
      day_of_month: Number(form.day_of_month) || 1,
      memo: form.memo || null,
      active: form.active,
    };
    if (editingId) {
      await (supabase as any).from("payment_reminders").update(payload).eq("id", editingId);
    } else {
      await (supabase as any).from("payment_reminders").insert(payload);
    }
    setSaving(false);
    setShowForm(false);
    setEditingId(null);
    toast({ title: editingId ? "更新しました" : "追加しました" });
    fetchReminders();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("このリマインドを削除しますか？")) return;
    await (supabase as any).from("payment_reminders").delete().eq("id", id);
    toast({ title: "削除しました" });
    fetchReminders();
  };

  const handleToggleActive = async (r: PaymentReminder) => {
    await (supabase as any).from("payment_reminders").update({ active: !r.active }).eq("id", r.id);
    fetchReminders();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell size={18} />
          支払いリマインド
        </CardTitle>
        <CardDescription>
          毎月指定した日付にホーム画面へポップアップ通知が表示されます。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <p className="text-sm text-muted-foreground">読み込み中...</p>
        ) : (
          <>
            {reminders.length === 0 && !showForm && (
              <p className="text-sm text-muted-foreground">リマインドが登録されていません。</p>
            )}
            <div className="space-y-2">
              {reminders.map((r) => (
                <div
                  key={r.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border ${r.active ? "bg-white" : "bg-gray-50 opacity-60"}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{r.title}</span>
                      <span className="text-xs text-muted-foreground bg-gray-100 px-2 py-0.5 rounded">
                        毎月{r.day_of_month}日
                      </span>
                      {r.amount > 0 && (
                        <span className="text-xs font-semibold text-blue-700">
                          ¥{r.amount.toLocaleString()}
                        </span>
                      )}
                    </div>
                    {r.memo && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{r.memo}</p>
                    )}
                  </div>
                  <Switch
                    checked={r.active}
                    onCheckedChange={() => handleToggleActive(r)}
                    title={r.active ? "無効にする" : "有効にする"}
                  />
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(r)}>
                    <Pencil size={14} />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDelete(r.id)}>
                    <Trash2 size={14} />
                  </Button>
                </div>
              ))}
            </div>

            {showForm && (
              <div className="border rounded-lg p-4 space-y-3 bg-slate-50">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-semibold">{editingId ? "リマインドを編集" : "新しいリマインドを追加"}</span>
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setShowForm(false)}>
                    <X size={14} />
                  </Button>
                </div>
                <div>
                  <Label className="text-xs">タイトル <span className="text-destructive">*</span></Label>
                  <Input
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    placeholder="例：ルーム41 家賃"
                    className="mt-1"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">金額（円）</Label>
                    <Input
                      type="number"
                      value={form.amount || ""}
                      onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })}
                      placeholder="例：10600"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">毎月何日</Label>
                    <Input
                      type="number"
                      min={1}
                      max={31}
                      value={form.day_of_month}
                      onChange={(e) => setForm({ ...form, day_of_month: Number(e.target.value) })}
                      className="mt-1"
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">メモ（振込先・連絡先など）</Label>
                  <Textarea
                    value={form.memo || ""}
                    onChange={(e) => setForm({ ...form, memo: e.target.value })}
                    placeholder="例：七十七銀行 小松島支店 口座番号:9072730"
                    rows={3}
                    className="mt-1 text-sm"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>キャンセル</Button>
                  <Button size="sm" onClick={handleSave} disabled={saving}>
                    <Check size={14} />
                    {saving ? "保存中..." : "保存"}
                  </Button>
                </div>
              </div>
            )}

            {!showForm && (
              <Button variant="outline" size="sm" className="w-full" onClick={openAdd}>
                <Plus size={14} />
                支払いリマインドを追加
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
