import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Copy, Loader2, RefreshCw, Settings } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { lineWebhookUrl } from "@/lib/lineInbox";

// お客様用の公式LINEの見張りの設定（店長・オーナー）。Channel secret は Vault に入り、画面には「登録済み」しか返らない。

export type LineCustomerSettings = {
  enabled: boolean;
  autoReply: boolean;
  waitMinutes: number;
  instructions: string | null;
  webhookKey: string | null;
  botBasicId: string | null;
  botName: string | null;
  verifiedAt: string | null;
  lastError: string | null;
  channelId: string | null;
  configured: boolean;
};

type VerifyResult = { ok: boolean; error?: string; basicId?: string; name?: string; chatMode?: string; webhookUrl?: string | null; webhookSet?: boolean; webhookActive?: boolean | null };

const rpc = (name: string, args: Record<string, unknown>) =>
  (supabase.rpc as unknown as (rpcName: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>)(name, args);

export function useLineCustomerSettings(storeId: string | null) {
  const [settings, setSettings] = useState<LineCustomerSettings | null>(null);
  const [canManage, setCanManage] = useState(false);
  const load = useCallback(async () => {
    if (!storeId) return;
    const { data, error } = await rpc("get_line_customer_settings", { p_store_id: storeId });
    if (error) {
      setCanManage(false);
      return;
    }
    setCanManage(true);
    setSettings(data as LineCustomerSettings);
  }, [storeId]);
  useEffect(() => { void load(); }, [load]);
  return { settings, canManage, reload: load };
}

export function LineCustomerSettingsDialog({ storeId, settings, onSaved }: { storeId: string; settings: LineCustomerSettings | null; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ enabled: false, autoReply: true, waitMinutes: "5", instructions: "", channelId: "", channelSecret: "" });
  const [busy, setBusy] = useState<"save" | "verify" | null>(null);
  const [verify, setVerify] = useState<VerifyResult | null>(null);

  useEffect(() => {
    if (!open || !settings) return;
    setForm({
      enabled: settings.enabled,
      autoReply: settings.autoReply,
      waitMinutes: String(settings.waitMinutes ?? 5),
      instructions: settings.instructions ?? "",
      channelId: settings.channelId ?? "",
      channelSecret: "",
    });
    setVerify(null);
  }, [open, settings]);

  const webhookUrl = settings?.webhookKey ? lineWebhookUrl(import.meta.env.VITE_SUPABASE_URL ?? "", settings.webhookKey) : null;

  const runVerify = async () => {
    setBusy("verify");
    try {
      const { data, error } = await supabase.functions.invoke("line-customer-reply", { body: { action: "verify", storeId } });
      if (error) throw error;
      setVerify(data as VerifyResult);
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    setBusy("save");
    try {
      const { error } = await rpc("save_line_customer_settings", {
        p_store_id: storeId,
        p_enabled: form.enabled,
        p_auto_reply: form.autoReply,
        p_wait_minutes: Number(form.waitMinutes) || 5,
        p_instructions: form.instructions,
        p_channel_id: form.channelId,
        p_channel_secret: form.channelSecret,
      });
      if (error) throw new Error(error.message);
      toast.success("保存しました");
      setForm((prev) => ({ ...prev, channelSecret: "" }));
      onSaved();
      if (form.channelId || settings?.configured) await runVerify();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    toast.success("コピーしました");
  };

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Settings size={14} className="mr-1" />設定
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>公式LINEの見張り・自動応答</DialogTitle></DialogHeader>
          <div className="space-y-4 text-sm">
            <div className="rounded-md bg-muted/50 p-3 text-xs space-y-1">
              <p className="font-semibold">つなぎ方（最初の1回だけ）</p>
              <p>1. LINE Developers（developers.line.biz）でお客様用の公式アカウントの Messaging API チャネルを開き、「チャネル基本設定」の <b>チャネルID</b> と <b>チャネルシークレット</b> を下に貼って保存</p>
              <p>2. 「Messaging API設定」の Webhook URL に下のURLを貼り、「Webhookの利用」をオン</p>
              <p>3. LINE Official Account Manager の「応答設定」で <b>チャット：オン</b>・<b>Webhook：オン</b>（今まで通りスマホのアプリで手で返信できます）</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>チャネルID</Label>
                <Input value={form.channelId} inputMode="numeric" autoComplete="off" onChange={(e) => setForm({ ...form, channelId: e.target.value.trim() })} />
              </div>
              <div className="space-y-1">
                <Label>チャネルシークレット</Label>
                <Input type="password" autoComplete="off" value={form.channelSecret} placeholder={settings?.configured ? "登録済み（変えるときだけ）" : ""} onChange={(e) => setForm({ ...form, channelSecret: e.target.value.trim() })} />
              </div>
            </div>

            {webhookUrl && (
              <div className="space-y-1">
                <Label>Webhook URL（LINE Developers に貼る）</Label>
                <div className="flex gap-2">
                  <Input readOnly value={webhookUrl} className="font-mono text-[11px]" />
                  <Button type="button" size="icon" variant="outline" onClick={() => void copy(webhookUrl)}><Copy size={14} /></Button>
                </div>
              </div>
            )}

            <label className="flex items-center justify-between gap-3">
              <span>見張る（届いたらスマホに通知）</span>
              <Switch checked={form.enabled} onCheckedChange={(on) => setForm({ ...form, enabled: on })} />
            </label>
            <label className="flex items-center justify-between gap-3">
              <span>返事が無ければ自動で一次対応する</span>
              <Switch checked={form.autoReply} onCheckedChange={(on) => setForm({ ...form, autoReply: on })} />
            </label>
            <div className="flex items-center gap-2">
              <Input className="w-20" type="number" min={1} max={60} value={form.waitMinutes} onChange={(e) => setForm({ ...form, waitMinutes: e.target.value })} />
              <span>分たってもスタッフが返事（または「対応済み」）しなければ、AIが返事を送る</span>
            </div>
            <div className="space-y-1">
              <Label>AIへの追加の指示（任意）</Label>
              <Textarea rows={4} value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })}
                placeholder={"例：駐車場はありません。近くのコインパーキングをご案内\n例：当日予約は電話が確実です"} />
              <p className="text-[11px] text-muted-foreground">料金・営業時間・今日と明日の出勤はシステムから自動で渡します。予約の確定・空きの約束はしません。</p>
            </div>

            {(verify || settings?.verifiedAt || settings?.lastError) && (
              <div className="rounded-md border p-3 text-xs space-y-1">
                {verify?.ok || (!verify && settings?.verifiedAt && !settings.lastError) ? (
                  <>
                    <p className="flex items-center gap-1 text-emerald-700"><CheckCircle2 size={14} />LINEにつながりました：{verify?.name ?? settings?.botName}（{verify?.basicId ?? settings?.botBasicId}）</p>
                    {verify && <p>Webhook URL：{verify.webhookSet ? "設定済み" : "まだ違うURLです（上のURLを LINE Developers に貼ってください）"}{verify.webhookActive === false && "・Webhookの利用がオフです"}</p>}
                    {verify?.chatMode === "bot" && <p className="text-amber-700">チャットがオフ（Bot）です。手で返信するなら Official Account Manager でチャットをオンに</p>}
                  </>
                ) : (
                  <p className="text-red-700">つながりません：{verify?.error ?? settings?.lastError}</p>
                )}
              </div>
            )}

            <div className="flex justify-between gap-2">
              <Button variant="outline" onClick={() => void runVerify()} disabled={busy !== null || !settings?.configured}>
                {busy === "verify" ? <Loader2 size={14} className="mr-1 animate-spin" /> : <RefreshCw size={14} className="mr-1" />}接続を確認
              </Button>
              <Button onClick={() => void save()} disabled={busy !== null}>
                {busy === "save" && <Loader2 size={14} className="mr-1 animate-spin" />}保存
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
