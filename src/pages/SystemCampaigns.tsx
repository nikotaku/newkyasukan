import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, ArchiveRestore, CalendarRange, Pencil, Plus, Tag, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AdminPageShell } from "@/components/AdminPageShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import {
  CAMPAIGN_STATUS_LABEL,
  campaignDaysLeft,
  campaignPeriodLabel,
  campaignStatus,
  sortCampaigns,
  todayJst,
  validateCampaign,
  type CampaignRecord,
  type CampaignStatus,
} from "@/lib/campaigns";

// 設定ダッシュボードの「キャンペーン」タブ。名前・内容・適用期間・備考・割引との結びつき、継続中かアーカイブかを管理する。
// 期間の状態（継続中／開始前／期間終了）は日付から自動。終わったものは「アーカイブ」で一覧から外す（消さずに残る）。

type Filter = "active" | "archived";

interface DiscountOption {
  id: string;
  name: string;
}

interface FormState {
  id: string | null;
  name: string;
  details: string;
  start_date: string;
  end_date: string;
  notes: string;
  discount_id: string;
}

const EMPTY_FORM: FormState = { id: null, name: "", details: "", start_date: "", end_date: "", notes: "", discount_id: "" };

const STATUS_CLASS: Record<CampaignStatus, string> = {
  running: "bg-emerald-100 text-emerald-800 border-emerald-200",
  upcoming: "bg-sky-100 text-sky-800 border-sky-200",
  ended: "bg-amber-100 text-amber-800 border-amber-200",
  archived: "bg-gray-100 text-gray-600 border-gray-200",
};

// campaigns は生成済みの型に無いので型を外して読む
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const campaignsTable = () => (supabase.from as any)("campaigns");

export default function SystemCampaigns({ embedded = false }: { embedded?: boolean } = {}) {
  const [rows, setRows] = useState<CampaignRecord[]>([]);
  const [discounts, setDiscounts] = useState<DiscountOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("active");
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const today = todayJst();

  const load = useCallback(async () => {
    setLoading(true);
    const [campaignRes, discountRes] = await Promise.all([
      campaignsTable().select("id, name, details, start_date, end_date, notes, discount_id, archived_at, display_order, updated_at"),
      supabase.from("discounts").select("id, name").order("display_order", { ascending: true }),
    ]);
    if (campaignRes.error) toast.error(`キャンペーンを読めませんでした：${campaignRes.error.message}`);
    setRows((campaignRes.data ?? []) as CampaignRecord[]);
    setDiscounts(((discountRes.data ?? []) as DiscountOption[]).filter((item) => item.name));
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const discountName = useMemo(() => new Map(discounts.map((item) => [item.id, item.name])), [discounts]);
  const sorted = useMemo(() => sortCampaigns(rows, today), [rows, today]);
  const activeRows = sorted.filter((row) => !row.archived_at);
  const archivedRows = sorted.filter((row) => row.archived_at);
  const shown = filter === "active" ? activeRows : archivedRows;
  const runningCount = activeRows.filter((row) => campaignStatus(row, today) === "running").length;

  const openEdit = (row?: CampaignRecord) => {
    setForm(
      row
        ? {
            id: row.id,
            name: row.name,
            details: row.details ?? "",
            start_date: row.start_date ?? "",
            end_date: row.end_date ?? "",
            notes: row.notes ?? "",
            discount_id: row.discount_id ?? "",
          }
        : { ...EMPTY_FORM, start_date: today },
    );
  };

  const save = async () => {
    if (!form || saving) return;
    const problem = validateCampaign(form);
    if (problem) {
      toast.error(problem);
      return;
    }
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      details: form.details.trim() || null,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      notes: form.notes.trim() || null,
      discount_id: form.discount_id || null,
    };
    const { error } = form.id
      ? await campaignsTable().update(payload).eq("id", form.id)
      : await campaignsTable().insert({ ...payload, display_order: rows.length + 1 });
    setSaving(false);
    if (error) {
      toast.error(`保存できませんでした：${error.message}`);
      return;
    }
    toast.success(form.id ? "キャンペーンを更新しました" : "キャンペーンを追加しました");
    setForm(null);
    load();
  };

  const setArchived = async (row: CampaignRecord, archived: boolean) => {
    const { error } = await campaignsTable()
      .update({ archived_at: archived ? new Date().toISOString() : null })
      .eq("id", row.id);
    if (error) {
      toast.error(`変更できませんでした：${error.message}`);
      return;
    }
    toast.success(archived ? `「${row.name}」をアーカイブしました` : `「${row.name}」を継続中に戻しました`);
    load();
  };

  const remove = async (row: CampaignRecord) => {
    if (!confirm(`「${row.name}」を削除しますか？（残しておくならアーカイブ）`)) return;
    const { error } = await campaignsTable().delete().eq("id", row.id);
    if (error) {
      toast.error(`削除できませんでした：${error.message}`);
      return;
    }
    toast.success("削除しました");
    load();
  };

  const body = (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-lg border bg-muted/40 p-1 text-sm">
          <button
            type="button"
            className={`rounded-md px-3 py-1.5 ${filter === "active" ? "bg-background font-semibold shadow-sm" : "text-muted-foreground"}`}
            onClick={() => setFilter("active")}
          >
            継続中・予定（{activeRows.length}）
          </button>
          <button
            type="button"
            className={`rounded-md px-3 py-1.5 ${filter === "archived" ? "bg-background font-semibold shadow-sm" : "text-muted-foreground"}`}
            onClick={() => setFilter("archived")}
          >
            アーカイブ（{archivedRows.length}）
          </button>
        </div>
        <Button onClick={() => openEdit()} size="sm">
          <Plus size={16} className="mr-1" />
          キャンペーンを追加
        </Button>
      </div>

      {filter === "active" && !loading && (
        <p className="text-sm text-muted-foreground">
          今やっているキャンペーン：<span className="font-semibold text-foreground">{runningCount}件</span>
          {" "}期間が終わったものは「アーカイブ」にすると一覧から外れます（記録は残ります）。
        </p>
      )}

      {loading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">読み込み中…</p>
      ) : shown.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {filter === "active" ? "キャンペーンはまだありません。「キャンペーンを追加」から登録できます。" : "アーカイブしたキャンペーンはありません。"}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {shown.map((row) => {
            const status = campaignStatus(row, today);
            const daysLeft = status === "running" ? campaignDaysLeft(row, today) : null;
            const discount = row.discount_id ? discountName.get(row.discount_id) : null;
            return (
              <Card key={row.id} className={status === "archived" ? "opacity-80" : ""}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className={STATUS_CLASS[status]}>
                          {CAMPAIGN_STATUS_LABEL[status]}
                        </Badge>
                        {daysLeft !== null && daysLeft <= 7 && (
                          <span className="text-xs font-semibold text-rose-600">{daysLeft === 0 ? "今日まで" : `あと${daysLeft}日`}</span>
                        )}
                      </div>
                      <h3 className="mt-1 break-words text-base font-bold">{row.name}</h3>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => openEdit(row)} aria-label="編集">
                      <Pencil size={16} />
                    </Button>
                  </div>

                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <CalendarRange size={15} />
                    {campaignPeriodLabel(row)}
                  </div>
                  {discount && (
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Tag size={15} />
                      割引：{discount}
                    </div>
                  )}
                  {row.details && <p className="whitespace-pre-wrap break-words text-sm">{row.details}</p>}
                  {row.notes && (
                    <div className="rounded-md bg-muted/50 px-3 py-2 text-sm">
                      <div className="text-xs font-semibold text-muted-foreground">備考</div>
                      <p className="whitespace-pre-wrap break-words">{row.notes}</p>
                    </div>
                  )}

                  <div className="flex flex-wrap justify-end gap-2 pt-1">
                    {row.archived_at ? (
                      <Button variant="outline" size="sm" onClick={() => setArchived(row, false)}>
                        <ArchiveRestore size={15} className="mr-1" />
                        継続中に戻す
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" onClick={() => setArchived(row, true)}>
                        <Archive size={15} className="mr-1" />
                        アーカイブ
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" className="text-destructive" onClick={() => remove(row)}>
                      <Trash2 size={15} className="mr-1" />
                      削除
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={form !== null} onOpenChange={(open) => !open && !saving && setForm(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{form?.id ? "キャンペーンを編集" : "キャンペーンを追加"}</DialogTitle>
          </DialogHeader>
          {form && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>名前</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="例：11月 ご新規様1,000円オフ" />
              </div>
              <div className="space-y-1.5">
                <Label>内容</Label>
                <Textarea rows={3} value={form.details} onChange={(e) => setForm({ ...form, details: e.target.value })} placeholder="例：初めてのお客様は全コース1,000円引き" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>開始日</Label>
                  <Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>終了日（空なら期限なし）</Label>
                  <Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>使う割引（任意）</Label>
                <Select value={form.discount_id || "none"} onValueChange={(value) => setForm({ ...form, discount_id: value === "none" ? "" : value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">なし</SelectItem>
                    {discounts.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>備考</Label>
                <Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="例：エステ魂のクーポンと同じ内容。告知はX・HPニュース" />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setForm(null)} disabled={saving}>
              やめる
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? "保存中…" : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );

  return <AdminPageShell embedded={embedded}>{body}</AdminPageShell>;
}
