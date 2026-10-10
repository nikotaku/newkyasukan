import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, ExternalLink, Eye, EyeOff, KeyRound, Loader2, Pause, Pencil, Play, Plus, RefreshCw, Trash2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useAdminStore } from "@/hooks/useAdminStore";
import { supabase } from "@/integrations/supabase/client";
import { isAutoPostKind } from "@/lib/xAutoPost";
import { MenesnowInspectButton } from "@/components/sns/MenesnowInspectDialog";
import { businessDate, classifyPost, slotKeyOf } from "@/lib/xDailyPosts";
import { DEFAULT_X_OPERATIONS_PLAN, normalizeXOperationsPlan, X_OPS_CONTENT_KEY, type XAccountPlan, type XOperationsPlan } from "@/lib/xOperationsPlan";

// 店舗の投稿先（X の各アカウント・その他の媒体）。キーとパスワードは Vault に入り、ここには「登録済み」しか返らない。
// O2 の店舗アカウントは既存の O2StoreAvailabilitySettings（このすぐ下）で扱う。

type Channel = {
  id: string;
  platform: "x" | "other";
  account_key: string;
  label: string;
  handle: string | null;
  login_url: string | null;
  login_id: string | null;
  note: string | null;
  auto_post: boolean;
  paused_at: string | null;
  pause_reason: string | null;
  verified_at: string | null;
  last_success_at: string | null;
  last_post_url: string | null;
  last_error: string | null;
  last_error_at: string | null;
  consecutive_failures: number;
  keys_configured: boolean;
  password_configured: boolean;
};

type DayRow = {
  account_key: string;
  slot_key: string;
  posted_at: string | null;
  publish_status: "posting" | "posted" | "failed" | "skipped" | null;
  post_url: string | null;
  error_message: string | null;
};

type XForm = { channel: Channel | null; account: XAccountPlan; apiKey: string; apiSecret: string; accessToken: string; accessTokenSecret: string };
type OtherForm = { channel: Channel | null; label: string; loginUrl: string; loginId: string; password: string; handle: string; note: string };

const rpc = (name: string, args: Record<string, unknown>) =>
  (supabase.rpc as unknown as (rpcName: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>)(name, args);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const untyped = (table: string) => (supabase as any).from(table);

const formatDateTime = (value: string | null) => value
  ? new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value))
  : "—";

const X_KEY_FIELDS: Array<{ key: keyof Pick<XForm, "apiKey" | "apiSecret" | "accessToken" | "accessTokenSecret">; label: string; hint: string }> = [
  { key: "apiKey", label: "API Key（Consumer Key）", hint: "Keys and tokens → Consumer Keys" },
  { key: "apiSecret", label: "API Key Secret（Consumer Secret）", hint: "同じ場所。一度しか表示されません" },
  { key: "accessToken", label: "Access Token", hint: "Authentication Tokens → Access Token and Secret" },
  { key: "accessTokenSecret", label: "Access Token Secret", hint: "権限を Read and write にしてから発行したもの" },
];

function channelState(channel: Channel | undefined) {
  if (!channel || !channel.keys_configured) return { label: "未登録", tone: "muted" as const, icon: KeyRound };
  if (channel.paused_at) return { label: "停止中", tone: "danger" as const, icon: Pause };
  if (!channel.verified_at) return { label: "接続を確認してください", tone: "warn" as const, icon: AlertTriangle };
  if (!channel.auto_post) return { label: "自動投稿オフ", tone: "muted" as const, icon: Pause };
  if (channel.last_error && (!channel.last_success_at || (channel.last_error_at ?? "") > channel.last_success_at)) return { label: "エラーあり", tone: "warn" as const, icon: AlertTriangle };
  return { label: "自動投稿中", tone: "ok" as const, icon: CheckCircle2 };
}

const toneClass = {
  ok: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  warn: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  danger: "bg-red-500/15 text-red-700 dark:text-red-300",
  muted: "bg-muted text-muted-foreground",
};

export function StorePostChannels() {
  const { storeId } = useAdminStore();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [plan, setPlan] = useState<XOperationsPlan>(DEFAULT_X_OPERATIONS_PLAN);
  const [dayRows, setDayRows] = useState<DayRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [xForm, setXForm] = useState<XForm | null>(null);
  const [otherForm, setOtherForm] = useState<OtherForm | null>(null);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const date = businessDate(new Date());

  const load = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    const [channelsRes, planRes, rowsRes] = await Promise.all([
      rpc("get_store_post_channels", { p_store_id: storeId }),
      supabase.from("site_content").select("value").eq("store_id", storeId).eq("key", X_OPS_CONTENT_KEY).maybeSingle(),
      untyped("x_daily_posts").select("account_key,slot_key,posted_at,publish_status,post_url,error_message").eq("store_id", storeId).eq("post_date", date),
    ]);
    if (channelsRes.error) toast.error(`投稿先を読み込めませんでした: ${channelsRes.error.message}`);
    setChannels((channelsRes.data as Channel[] | null) ?? []);
    try {
      setPlan(planRes.data?.value ? normalizeXOperationsPlan(JSON.parse(planRes.data.value)) : DEFAULT_X_OPERATIONS_PLAN);
    } catch {
      setPlan(DEFAULT_X_OPERATIONS_PLAN);
    }
    setDayRows((rowsRes.data as DayRow[] | null) ?? []);
    setLoading(false);
  }, [storeId, date]);

  useEffect(() => {
    void load();
  }, [load]);

  const xChannel = (accountKey: string) => channels.find((c) => c.platform === "x" && c.account_key === accountKey);
  const others = channels.filter((c) => c.platform === "other");
  const rowOf = (accountKey: string, slotKey: string) => dayRows.find((r) => r.account_key === accountKey && r.slot_key === slotKey);

  const run = async (key: string, action: () => Promise<void>) => {
    setBusy(key);
    try {
      await action();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
      void load();
    }
  };

  const saveX = () => xForm && run("save-x", async () => {
    const { data, error } = await rpc("save_store_post_channel", {
      p_store_id: storeId,
      p_channel_id: xForm.channel?.id ?? null,
      p_platform: "x",
      p_account_key: xForm.account.key,
      p_label: xForm.account.name,
      p_handle: xForm.channel?.handle ?? null,
      p_auto_post: xForm.channel?.auto_post ?? false,
      p_secrets: { api_key: xForm.apiKey, api_secret: xForm.apiSecret, access_token: xForm.accessToken, access_token_secret: xForm.accessTokenSecret },
    });
    if (error) throw new Error(error.message);
    setXForm(null);
    toast.success("キーを保存しました。つながるか確認します");
    await verify(data as string);
  });

  const verify = async (channelId: string) => {
    const { data, error } = await supabase.functions.invoke("x-auto-post", { body: { action: "verify", channel_id: channelId } });
    if (error) throw new Error(error.message);
    const result = data as { ok: boolean; username: string | null; error: string | null };
    if (result.ok) toast.success(`@${result.username} につながりました`);
    else toast.error(`つながりませんでした：${result.error ?? "原因不明"}`);
  };

  const setAuto = (channel: Channel, autoPost: boolean, resume = false) => run(`auto-${channel.id}`, async () => {
    const { error } = await rpc("set_store_post_channel_state", { p_channel_id: channel.id, p_auto_post: autoPost, p_resume: resume });
    if (error) throw new Error(error.message);
    toast.success(resume ? "自動投稿を再開しました" : autoPost ? "自動投稿をオンにしました" : "自動投稿をオフにしました");
  });

  const runNow = () => run("run-now", async () => {
    const { data, error } = await supabase.functions.invoke("x-auto-post", { body: { action: "run", store_id: storeId } });
    if (error) throw new Error(error.message);
    const result = data as { posted: number; results: Array<{ action: string }> };
    const failed = result.results?.filter((r) => r.action === "failed" || r.action === "paused").length ?? 0;
    toast.success(`確認しました：投稿 ${result.posted ?? 0}件${failed ? `・失敗 ${failed}件` : ""}（時間になった投稿だけ出します）`);
  });

  const saveOther = () => otherForm && run("save-other", async () => {
    if (!otherForm.label.trim()) throw new Error("媒体名を入れてください");
    const { error } = await rpc("save_store_post_channel", {
      p_store_id: storeId,
      p_channel_id: otherForm.channel?.id ?? null,
      p_platform: "other",
      p_account_key: otherForm.channel?.account_key ?? `other-${Date.now().toString(36)}`,
      p_label: otherForm.label,
      p_handle: otherForm.handle,
      p_login_url: otherForm.loginUrl,
      p_login_id: otherForm.loginId,
      p_note: otherForm.note,
      p_auto_post: false,
      p_secrets: { password: otherForm.password },
    });
    if (error) throw new Error(error.message);
    setOtherForm(null);
    toast.success("保存しました");
  });

  const removeOther = (channel: Channel) => {
    if (!window.confirm(`「${channel.label}」を削除しますか？ログイン情報も消えます`)) return;
    void run(`del-${channel.id}`, async () => {
      const { error } = await rpc("delete_store_post_channel", { p_channel_id: channel.id });
      if (error) throw new Error(error.message);
    });
  };

  const reveal = (channel: Channel) => run(`reveal-${channel.id}`, async () => {
    if (revealed[channel.id] !== undefined) {
      setRevealed((prev) => {
        const next = { ...prev };
        delete next[channel.id];
        return next;
      });
      return;
    }
    const { data, error } = await rpc("reveal_store_post_channel_password", { p_channel_id: channel.id });
    if (error) throw new Error(error.message);
    setRevealed((prev) => ({ ...prev, [channel.id]: (data as string | null) ?? "" }));
  });

  const slotsFor = useMemo(() => (account: XAccountPlan) => account.daily
    .filter((row) => row.time.trim() || row.type.trim())
    .map((row) => ({ row, slotKey: slotKeyOf(row), auto: isAutoPostKind(classifyPost(account, row)) })), []);

  if (!storeId) return null;

  return (
    <div className="rounded-xl border bg-card p-4 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-bold">店舗の投稿先</h3>
          <p className="text-xs text-muted-foreground mt-1">
            店舗として投稿するアカウントのキー・ログイン情報と、どの投稿がどこへ出るか・止まっていないかをまとめて見ます。
            X は運用表の「決まった形の投稿」（出勤・空き枠・紹介・イベント・口コミ）だけを時間どおり自動で出し、AIの下書きは今まで通り確認してから手動で出します。
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}><RefreshCw size={14} className={loading ? "mr-1 animate-spin" : "mr-1"} />更新</Button>
          <Button variant="outline" size="sm" onClick={runNow} disabled={busy !== null || !channels.some((c) => c.platform === "x" && c.auto_post && !c.paused_at)}>
            {busy === "run-now" ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Play size={14} className="mr-1" />}今すぐ確認
          </Button>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        {plan.accounts.map((account) => {
          const channel = xChannel(account.key);
          const state = channelState(channel);
          const slots = slotsFor(account);
          const autoSlots = slots.filter((s) => s.auto);
          return (
            <div key={account.key} className="rounded-lg border p-3 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">X・{account.name}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {channel?.handle ? <a className="underline" href={`https://x.com/${channel.handle.replace(/^@/, "")}`} target="_blank" rel="noreferrer">{channel.handle}</a> : "アカウント未確認"}
                  </p>
                </div>
                <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${toneClass[state.tone]}`}>
                  <state.icon size={12} />{state.label}
                </span>
              </div>

              {channel?.paused_at && (
                <div className="rounded-md bg-red-500/10 p-2 text-xs text-red-700 dark:text-red-300">
                  {formatDateTime(channel.paused_at)} に止めました：{channel.pause_reason ?? channel.last_error}
                </div>
              )}
              {!channel?.paused_at && channel?.last_error && (
                <p className="text-xs text-amber-700 dark:text-amber-300">最後のエラー（{formatDateTime(channel.last_error_at)}）：{channel.last_error}</p>
              )}

              <div className="space-y-1">
                <p className="text-[11px] font-medium text-muted-foreground">今日（{date.slice(5).replace("-", "/")}）の投稿</p>
                {slots.length === 0 && <p className="text-xs text-muted-foreground">運用表に投稿の時間がありません</p>}
                {slots.map(({ row, slotKey, auto }) => {
                  const day = rowOf(account.key, slotKey);
                  let status: { text: string; className: string; icon: typeof Clock };
                  if (day?.publish_status === "posted") status = { text: "自動で投稿済み", className: "text-emerald-700 dark:text-emerald-300", icon: CheckCircle2 };
                  else if (day?.posted_at) status = { text: "手動で投稿済み", className: "text-emerald-700 dark:text-emerald-300", icon: CheckCircle2 };
                  else if (day?.publish_status === "failed") status = { text: "失敗", className: "text-red-700 dark:text-red-300", icon: XCircle };
                  else if (day?.publish_status === "posting") status = { text: "投稿中", className: "text-sky-700", icon: Loader2 };
                  else if (day?.publish_status === "skipped") status = { text: "見送り", className: "text-amber-700 dark:text-amber-300", icon: AlertTriangle };
                  else if (!auto) status = { text: "手動（AIの下書き）", className: "text-muted-foreground", icon: Pencil };
                  else if (channel?.auto_post && !channel.paused_at && channel.keys_configured) status = { text: "自動で出す予定", className: "text-sky-700 dark:text-sky-300", icon: Clock };
                  else status = { text: "手動（自動投稿オフ）", className: "text-muted-foreground", icon: Pencil };
                  return (
                    <div key={slotKey} className="text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate"><span className="tabular-nums text-muted-foreground mr-1">{row.time}</span>{row.type}</span>
                        <span className={`inline-flex shrink-0 items-center gap-1 ${status.className}`}>
                          <status.icon size={12} />
                          {day?.post_url ? <a href={day.post_url} target="_blank" rel="noreferrer" className="underline">{status.text}</a> : status.text}
                        </span>
                      </div>
                      {day?.error_message && (day.publish_status === "failed" || day.publish_status === "skipped") && (
                        <p className="text-[11px] text-muted-foreground pl-10">{day.error_message}</p>
                      )}
                    </div>
                  );
                })}
                {autoSlots.length === 0 && slots.length > 0 && <p className="text-[11px] text-muted-foreground">このアカウントは自動で出す投稿がありません（すべてAIの下書き）</p>}
              </div>

              <div className="flex flex-wrap items-center gap-2 border-t pt-2">
                <Button size="sm" variant="outline" onClick={() => setXForm({ channel: channel ?? null, account, apiKey: "", apiSecret: "", accessToken: "", accessTokenSecret: "" })}>
                  <KeyRound size={14} className="mr-1" />{channel?.keys_configured ? "キーを変更" : "キーを登録"}
                </Button>
                {channel?.keys_configured && (
                  <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void run(`verify-${channel.id}`, () => verify(channel.id))}>
                    {busy === `verify-${channel.id}` ? <Loader2 size={14} className="mr-1 animate-spin" /> : <RefreshCw size={14} className="mr-1" />}接続を確認
                  </Button>
                )}
                {channel?.paused_at && (
                  <Button size="sm" disabled={busy !== null} onClick={() => void setAuto(channel, true, true)}><Play size={14} className="mr-1" />再開</Button>
                )}
                {channel && !channel.paused_at && (
                  <label className="ml-auto flex items-center gap-2 text-xs">
                    自動投稿
                    <Switch
                      checked={channel.auto_post}
                      disabled={busy !== null || !channel.keys_configured || !channel.verified_at || autoSlots.length === 0}
                      onCheckedChange={(on) => void setAuto(channel, on)}
                    />
                  </label>
                )}
              </div>
              {channel?.last_success_at && (
                <p className="text-[11px] text-muted-foreground">
                  最後に自動で投稿：{formatDateTime(channel.last_success_at)}
                  {channel.last_post_url && <a href={channel.last_post_url} target="_blank" rel="noreferrer" className="ml-1 underline">投稿を見る</a>}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">その他の媒体（ログイン情報・投稿先のメモ）</p>
          <Button size="sm" variant="outline" onClick={() => setOtherForm({ channel: null, label: "", loginUrl: "", loginId: "", password: "", handle: "", note: "" })}>
            <Plus size={14} className="mr-1" />追加
          </Button>
        </div>
        {others.length === 0 ? (
          <p className="text-xs text-muted-foreground">まだありません。店舗として投稿している媒体のログイン情報をここにまとめておけます（自動投稿はしません）</p>
        ) : (
          <div className="grid gap-2 md:grid-cols-2">
            {others.map((channel) => (
              <div key={channel.id} className="rounded-lg border p-3 text-xs space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold">{channel.label}</p>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setOtherForm({ channel, label: channel.label, loginUrl: channel.login_url ?? "", loginId: channel.login_id ?? "", password: "", handle: channel.handle ?? "", note: channel.note ?? "" })}><Pencil size={14} /></Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => removeOther(channel)}><Trash2 size={14} /></Button>
                  </div>
                </div>
                {channel.note && <p className="text-muted-foreground">投稿内容：{channel.note}</p>}
                {channel.handle && <p>公開ページ：<a className="underline break-all" href={channel.handle} target="_blank" rel="noreferrer">{channel.handle}</a></p>}
                {channel.login_url && <p>ログイン：<a className="underline break-all" href={channel.login_url} target="_blank" rel="noreferrer">{channel.login_url}<ExternalLink size={11} className="inline ml-0.5" /></a></p>}
                <p>ID：{channel.login_id ?? "—"}</p>
                <p className="flex items-center gap-1">
                  パスワード：{channel.password_configured ? (revealed[channel.id] !== undefined ? <span className="font-mono">{revealed[channel.id] || "（空）"}</span> : "登録済み") : "未登録"}
                  {channel.password_configured && (
                    <button type="button" className="ml-1 text-muted-foreground" onClick={() => void reveal(channel)} aria-label="パスワードを表示">
                      {revealed[channel.id] !== undefined ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                  )}
                </p>
                {/men-esthe\.co\.jp/i.test(`${channel.login_url ?? ""} ${channel.handle ?? ""}`) && channel.password_configured && (
                  <div className="pt-1"><MenesnowInspectButton storeId={storeId} /></div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={xForm !== null} onOpenChange={(open) => !open && setXForm(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>X・{xForm?.account.name} のキー</DialogTitle></DialogHeader>
          {xForm && (
            <div className="space-y-3 text-sm">
              <p className="text-xs text-muted-foreground">
                developer.x.com でこのアカウントにログインし、アプリの「User authentication settings」で権限を <b>Read and write</b> にしてから、
                Keys and tokens の4つを貼り付けてください。{xForm.channel?.keys_configured && "空欄の項目は今のまま残ります。"}
              </p>
              {X_KEY_FIELDS.map((field) => (
                <div key={field.key} className="space-y-1">
                  <Label htmlFor={`x-${field.key}`}>{field.label}</Label>
                  <Input
                    id={`x-${field.key}`}
                    type="password"
                    autoComplete="off"
                    value={xForm[field.key]}
                    placeholder={xForm.channel?.keys_configured ? "登録済み（変えるときだけ入力）" : ""}
                    onChange={(event) => setXForm({ ...xForm, [field.key]: event.target.value })}
                  />
                  <p className="text-[11px] text-muted-foreground">{field.hint}</p>
                </div>
              ))}
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" onClick={() => setXForm(null)}>やめる</Button>
                <Button
                  onClick={saveX}
                  disabled={busy !== null || (!xForm.channel?.keys_configured && X_KEY_FIELDS.some((f) => !xForm[f.key].trim()))}
                >
                  {busy === "save-x" && <Loader2 size={14} className="mr-1 animate-spin" />}保存して接続を確認
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={otherForm !== null} onOpenChange={(open) => !open && setOtherForm(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{otherForm?.channel ? "媒体を編集" : "媒体を追加"}</DialogTitle></DialogHeader>
          {otherForm && (
            <div className="space-y-3 text-sm">
              <div className="space-y-1"><Label>媒体名</Label><Input value={otherForm.label} onChange={(e) => setOtherForm({ ...otherForm, label: e.target.value })} placeholder="例：メンエスなう（店舗）" /></div>
              <div className="space-y-1"><Label>投稿している内容</Label><Textarea rows={2} value={otherForm.note} onChange={(e) => setOtherForm({ ...otherForm, note: e.target.value })} placeholder="例：毎日の出勤・写メ日記" /></div>
              <div className="space-y-1"><Label>公開ページのURL</Label><Input value={otherForm.handle} onChange={(e) => setOtherForm({ ...otherForm, handle: e.target.value })} placeholder="https://" /></div>
              <div className="space-y-1"><Label>ログイン画面のURL</Label><Input value={otherForm.loginUrl} onChange={(e) => setOtherForm({ ...otherForm, loginUrl: e.target.value })} placeholder="https://" /></div>
              <div className="space-y-1"><Label>ログインID</Label><Input value={otherForm.loginId} onChange={(e) => setOtherForm({ ...otherForm, loginId: e.target.value })} autoComplete="off" /></div>
              <div className="space-y-1">
                <Label>パスワード</Label>
                <Input type="password" value={otherForm.password} onChange={(e) => setOtherForm({ ...otherForm, password: e.target.value })} autoComplete="new-password"
                  placeholder={otherForm.channel?.password_configured ? "登録済み（変えるときだけ入力）" : ""} />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" onClick={() => setOtherForm(null)}>やめる</Button>
                <Button onClick={saveOther} disabled={busy !== null}>{busy === "save-other" && <Loader2 size={14} className="mr-1 animate-spin" />}保存</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
