import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { AlertTriangle, CheckCircle2, ExternalLink, HelpCircle, Loader2, Pencil, Plus, RefreshCw, ShieldAlert, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { presetFor, SERVICE_PRESETS, type WatchLevel } from "@/lib/subscriptionWatch";

// 支払い管理の「サブスクの見張り」。登録したサブスクの課金が止まっていないかを1時間ごとに判定する
// （Edge Function subscription-check、判定は src/lib/subscriptionWatch.ts）。悪くなったらスマホ通知（topic subscription）。

interface Watch {
  id: string;
  service: string;
  name: string;
  plan: string | null;
  amount: number | null;
  billing_cycle: "monthly" | "yearly";
  next_billing_date: string | null;
  payment_method: string | null;
  card_expiry: string | null;
  manage_url: string | null;
  check_url: string | null;
  mail_keywords: string[];
  silence_days: number | null;
  notes: string | null;
  is_active: boolean;
  level: WatchLevel;
  reasons: string[];
  last_checked_at: string | null;
  last_paid_at: string | null;
}

type Draft = Omit<Watch, "id" | "level" | "reasons" | "last_checked_at" | "last_paid_at"> & { id?: string };

const LEVEL_VIEW: Record<WatchLevel, { label: string; className: string; icon: typeof ShieldCheck }> = {
  ok: { label: "問題なし", className: "border-emerald-200 bg-emerald-50 text-emerald-700", icon: ShieldCheck },
  warning: { label: "要確認", className: "border-amber-200 bg-amber-50 text-amber-700", icon: AlertTriangle },
  stopped: { label: "止まっている可能性", className: "border-rose-200 bg-rose-50 text-rose-700", icon: ShieldAlert },
  unknown: { label: "材料なし", className: "border-slate-200 bg-slate-50 text-slate-600", icon: HelpCircle },
};
const LEVEL_SORT: Record<WatchLevel, number> = { stopped: 0, warning: 1, unknown: 2, ok: 3 };

const emptyDraft = (service = "other"): Draft => {
  const preset = presetFor(service);
  return {
    service,
    name: service === "other" ? "" : preset.label.replace(/（.*）$/, ""),
    plan: null,
    amount: null,
    billing_cycle: "monthly",
    next_billing_date: null,
    payment_method: null,
    card_expiry: null,
    manage_url: preset.manageUrl ?? null,
    check_url: service === "vercel" || service === "domain" ? "https://enka-salon.jp/" : null,
    mail_keywords: [],
    silence_days: service === "ivry" ? 3 : null,
    notes: null,
    is_active: true,
  };
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const untyped = supabase as any;
const yen = (value: number | null) => (value == null ? "" : `¥${value.toLocaleString()}`);

export function SubscriptionWatchPanel({ storeId }: { storeId: string | null }) {
  const [watches, setWatches] = useState<Watch[]>([]);
  const [lastMailAt, setLastMailAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [payingId, setPayingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!storeId) return;
    const [watchResult, mailResult] = await Promise.all([
      untyped.from("subscription_watches").select("*").eq("store_id", storeId).order("sort_order").order("created_at"),
      untyped.from("report_email_messages").select("received_at").eq("store_id", storeId).order("received_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (watchResult.error) toast.error(`サブスクの見張りを読み込めませんでした: ${watchResult.error.message}`);
    setWatches((watchResult.data ?? []) as Watch[]);
    setLastMailAt(mailResult.data?.received_at ?? null);
    setLoading(false);
  }, [storeId]);

  useEffect(() => { void load(); }, [load]);

  // スマホ通知から開いたとき（/payments?tab=subscriptions）はここまで送る
  useEffect(() => {
    if (loading || new URLSearchParams(window.location.search).get("tab") !== "subscriptions") return;
    document.getElementById("subscriptions")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [loading]);

  const sorted = useMemo(
    () => [...watches].sort((a, b) => Number(!a.is_active) - Number(!b.is_active) || LEVEL_SORT[a.level] - LEVEL_SORT[b.level]),
    [watches],
  );
  const problems = watches.filter((watch) => watch.is_active && (watch.level === "stopped" || watch.level === "warning"));
  const monthlyTotal = watches.filter((watch) => watch.is_active && watch.amount)
    .reduce((sum, watch) => sum + (watch.billing_cycle === "yearly" ? Math.round((watch.amount ?? 0) / 12) : watch.amount ?? 0), 0);
  const mailSyncActive = lastMailAt && Date.now() - new Date(lastMailAt).getTime() < 7 * 86_400_000;

  const checkNow = async () => {
    if (!storeId) return;
    setChecking(true);
    const { data, error } = await supabase.functions.invoke("subscription-check", { body: { action: "check", storeId } });
    setChecking(false);
    if (error || data?.error) {
      toast.error(data?.error || "確認できませんでした");
      return;
    }
    toast.success("確認しました");
    void load();
  };

  const markPaid = async (watch: Watch) => {
    setPayingId(watch.id);
    const { error } = await untyped.rpc("mark_subscription_paid", { p_id: watch.id });
    setPayingId(null);
    if (error) { toast.error(`記録できませんでした: ${error.message}`); return; }
    toast.success(watch.next_billing_date ? "支払いを記録し、次の請求日をすすめました" : "支払いを記録しました");
    void load();
  };

  const save = async () => {
    if (!draft || !storeId) return;
    if (!draft.name.trim()) { toast.error("名前を入れてください"); return; }
    if (draft.card_expiry && !/^\d{4}-\d{2}$/.test(draft.card_expiry)) { toast.error("カードの有効期限は「2027-08」の形で入れてください"); return; }
    setSaving(true);
    const { id, ...fields } = draft;
    const row = {
      ...fields,
      name: fields.name.trim(),
      store_id: storeId,
      mail_keywords: fields.mail_keywords.map((keyword) => keyword.trim()).filter(Boolean),
      updated_at: new Date().toISOString(),
    };
    const { error } = id
      ? await untyped.from("subscription_watches").update(row).eq("id", id)
      : await untyped.from("subscription_watches").insert(row);
    setSaving(false);
    if (error) { toast.error(`保存できませんでした: ${error.message}`); return; }
    toast.success("保存しました（「今すぐ確認」で判定します）");
    setDraft(null);
    void load();
  };

  const remove = async () => {
    if (!draft?.id || !window.confirm(`「${draft.name}」の見張りをやめますか？`)) return;
    const { error } = await untyped.from("subscription_watches").delete().eq("id", draft.id);
    if (error) { toast.error(`削除できませんでした: ${error.message}`); return; }
    setDraft(null);
    void load();
  };

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => (current ? { ...current, [key]: value } : current));
  const preset = draft ? presetFor(draft.service) : null;

  return (
    <Card id="subscriptions" className={problems.length ? "border-rose-300" : undefined}>
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
          <span className="flex items-center gap-2">
            <ShieldCheck size={18} />サブスクの見張り
            {problems.length > 0 && <Badge variant="outline" className={LEVEL_VIEW.stopped.className}>{problems.length}件 要確認</Badge>}
          </span>
          <span className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => void checkNow()} disabled={checking || !watches.length}>
              {checking ? <Loader2 size={14} className="mr-1 animate-spin" /> : <RefreshCw size={14} className="mr-1" />}今すぐ確認
            </Button>
            <Button size="sm" onClick={() => setDraft(emptyDraft())}><Plus size={14} className="mr-1" />追加</Button>
          </span>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          1時間ごとに、課金が止まっていないかを確かめます（サービスへの問い合わせ・支払い失敗や停止のメール・請求日・カードの有効期限）。
          止まりそうなときはスマホに通知します。{monthlyTotal > 0 && <>月あたりの合計 <b>{yen(monthlyTotal)}</b>。</>}
        </p>
        {!mailSyncActive && (
          <p className="mt-1 rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-800">
            メールの取り込み（Gmail）が動いていないため、「支払いに失敗しました」「利用停止」などのメールでは判定できていません。店舗のGmailで scripts/gmail-report-sync.gs を設定すると、IVRy・Supabase などの請求メールも見るようになります。
          </p>
        )}
      </CardHeader>
      <CardContent className="p-0">
        {loading ? <div className="p-6 text-center"><Loader2 className="mx-auto animate-spin" /></div> : sorted.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            見張っているサブスクはありません。「追加」から Supabase・IVRy・SUBLINE・Twilio・エステ魂 などを登録してください。
          </div>
        ) : (
          <div className="divide-y">
            {sorted.map((watch) => {
              const view = LEVEL_VIEW[watch.is_active ? watch.level : "unknown"];
              const Icon = view.icon;
              return (
                <div key={watch.id} className={`grid gap-2 p-4 lg:grid-cols-[1fr_150px_auto] lg:items-start ${watch.is_active ? "" : "opacity-50"}`}>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className={view.className}><Icon size={12} className="mr-1" />{watch.is_active ? view.label : "見張り停止中"}</Badge>
                      <span className="font-semibold">{watch.name}</span>
                      {watch.plan && <span className="text-xs text-muted-foreground">{watch.plan}</span>}
                    </div>
                    <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                      {watch.reasons.map((reason) => <li key={reason}>・{reason}</li>)}
                    </ul>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {watch.payment_method && <>支払い：{watch.payment_method}　</>}
                      {watch.card_expiry && <>カード期限：{watch.card_expiry.replace("-", "/")}　</>}
                      {watch.last_checked_at && <>確認 {format(new Date(watch.last_checked_at), "M/d HH:mm")}</>}
                    </p>
                  </div>
                  <div className="text-sm">
                    <p className="font-bold tabular-nums">{yen(watch.amount)}{watch.amount != null && <span className="text-xs font-normal text-muted-foreground"> / {watch.billing_cycle === "yearly" ? "年" : "月"}</span>}</p>
                    {watch.next_billing_date && <p className="text-xs text-muted-foreground">次の請求 {format(new Date(`${watch.next_billing_date}T12:00:00`), "M/d(E)", { locale: ja })}</p>}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                    {watch.manage_url && (
                      <Button size="sm" variant="ghost" asChild><a href={watch.manage_url} target="_blank" rel="noreferrer"><ExternalLink size={14} className="mr-1" />管理画面</a></Button>
                    )}
                    <Button size="sm" variant="outline" disabled={payingId === watch.id} onClick={() => void markPaid(watch)}>
                      {payingId === watch.id ? <Loader2 size={14} className="animate-spin" /> : <><CheckCircle2 size={14} className="mr-1" />支払いを確認</>}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setDraft({ ...watch })}><Pencil size={14} /></Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      <Dialog open={!!draft} onOpenChange={(open) => { if (!open) setDraft(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader><DialogTitle>{draft?.id ? "サブスクの見張りを編集" : "サブスクを見張る"}</DialogTitle></DialogHeader>
          {draft && preset && (
            <div className="space-y-3">
              <div>
                <Label className="text-xs">サービス</Label>
                <Select
                  value={draft.service}
                  onValueChange={(service) => setDraft((current) => current?.id ? { ...current, service } : { ...emptyDraft(service), ...(current?.name && current.service === "other" ? { name: current.name } : {}) })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{SERVICE_PRESETS.map((item) => <SelectItem key={item.key} value={item.key}>{item.label}</SelectItem>)}</SelectContent>
                </Select>
                <p className="mt-1 text-[11px] text-muted-foreground">自動で確かめる方法：{preset.autoCheck}</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label className="text-xs">名前</Label><Input value={draft.name} onChange={(e) => set("name", e.target.value)} /></div>
                <div><Label className="text-xs">プラン</Label><Input value={draft.plan ?? ""} placeholder="例：Pro" onChange={(e) => set("plan", e.target.value || null)} /></div>
                <div><Label className="text-xs">金額（円）</Label><Input type="number" inputMode="numeric" value={draft.amount ?? ""} onChange={(e) => set("amount", e.target.value === "" ? null : Number(e.target.value))} /></div>
                <div>
                  <Label className="text-xs">請求の間隔</Label>
                  <Select value={draft.billing_cycle} onValueChange={(value) => set("billing_cycle", value as Draft["billing_cycle"])}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="monthly">毎月</SelectItem><SelectItem value="yearly">毎年</SelectItem></SelectContent>
                  </Select>
                </div>
                <div><Label className="text-xs">次の請求日</Label><Input type="date" value={draft.next_billing_date ?? ""} onChange={(e) => set("next_billing_date", e.target.value || null)} /></div>
                <div><Label className="text-xs">カードの有効期限</Label><Input type="month" value={draft.card_expiry ?? ""} onChange={(e) => set("card_expiry", e.target.value || null)} /></div>
              </div>
              <div><Label className="text-xs">支払い方法</Label><Input value={draft.payment_method ?? ""} placeholder="例：店のVisa（下4桁 1234）・口座振替" onChange={(e) => set("payment_method", e.target.value || null)} /></div>
              <p className="text-[11px] text-muted-foreground">カード番号・パスワードは入れないでください（下4桁まで）。</p>
              <div><Label className="text-xs">管理画面のURL（支払い方法を確かめる場所）</Label><Input value={draft.manage_url ?? ""} onChange={(e) => set("manage_url", e.target.value || null)} /></div>
              {!["supabase", "twilio", "subline", "estama"].includes(draft.service) && (
                <div><Label className="text-xs">開けるか確かめるURL（任意）</Label><Input value={draft.check_url ?? ""} placeholder="https://" onChange={(e) => set("check_url", e.target.value || null)} /></div>
              )}
              <div>
                <Label className="text-xs">請求メールの見分け（送り元・件名の言葉、カンマ区切り）</Label>
                <Input value={draft.mail_keywords.join(", ")} placeholder={preset.senders.length ? `自動：${preset.senders.join(", ")}` : "例：example.com, ○○サーバー"} onChange={(e) => set("mail_keywords", e.target.value.split(/[,、]/))} />
              </div>
              <div>
                <Label className="text-xs">通知が何日届かなければ要確認にするか（IVRy など・任意）</Label>
                <Input type="number" min={1} max={60} value={draft.silence_days ?? ""} onChange={(e) => set("silence_days", e.target.value === "" ? null : Number(e.target.value))} />
              </div>
              <div><Label className="text-xs">メモ</Label><Textarea rows={2} value={draft.notes ?? ""} onChange={(e) => set("notes", e.target.value || null)} /></div>
              <label className="flex items-center gap-2 text-sm"><Switch checked={draft.is_active} onCheckedChange={(value) => set("is_active", value)} />見張る</label>
            </div>
          )}
          <DialogFooter className="gap-2 sm:justify-between">
            {draft?.id ? <Button variant="ghost" className="text-rose-600" onClick={() => void remove()}>削除</Button> : <span />}
            <Button onClick={() => void save()} disabled={saving}>{saving && <Loader2 size={14} className="mr-1 animate-spin" />}保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
