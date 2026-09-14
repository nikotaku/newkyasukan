import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Loader2, Send, Store, ToggleLeft, ToggleRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { useAdminStore } from "@/hooks/useAdminStore";
import { supabase } from "@/integrations/supabase/client";
import { isValidEmail } from "@/lib/email";

type StoreAvailabilitySettings = {
  login_email: string | null;
  credential_configured: boolean;
  is_enabled: boolean;
  post_hour_jst: number;
  last_status: string | null;
  last_posted_at: string | null;
  last_error: string | null;
  last_post_url: string | null;
  last_business_date: string | null;
};

const O2_STORE_LOGIN_URL = "https://m-sns.net/shop/login/";
const rpc = (name: string, args: Record<string, unknown>) =>
  (supabase.rpc as unknown as (rpcName: string, params: Record<string, unknown>) => Promise<{
    data: unknown;
    error: { message: string } | null;
  }>)(name, args);

const statusLabel: Record<string, string> = {
  pending: "送信待ち",
  posting: "送信中",
  posted: "投稿済み",
  skipped: "投稿見送り",
  failed: "失敗",
  review_required: "要確認・再送停止",
};

const formatDateTime = (value: string | null) => value
  ? new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value))
  : "未実行";

export function O2StoreAvailabilitySettings() {
  const { user, loading: authLoading } = useAuth();
  const { storeId, store, loading: storeLoading } = useAdminStore();
  const [settings, setSettings] = useState<StoreAvailabilitySettings | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [posting, setPosting] = useState(false);

  const load = useCallback(async () => {
    if (!user || storeLoading) return;
    setLoading(true);
    const { data, error } = await rpc("get_o2_store_availability_settings_v1", { p_store_id: storeId });
    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }
    const current = Array.isArray(data) ? data[0] as StoreAvailabilitySettings | undefined : undefined;
    const next = current || {
      login_email: null,
      credential_configured: false,
      is_enabled: false,
      post_hour_jst: 11,
      last_status: null,
      last_posted_at: null,
      last_error: null,
      last_post_url: null,
      last_business_date: null,
    };
    setSettings(next);
    setEmail(next.login_email || "");
    setPassword("");
    setEnabled(next.is_enabled);
    setLoading(false);
  }, [storeId, storeLoading, user]);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    const normalizedEmail = email.trim();
    if (!normalizedEmail || !isValidEmail(normalizedEmail)) {
      toast.error("O2店舗ログインのメールアドレスを入力してください");
      return;
    }
    if (!settings?.credential_configured && !password) {
      toast.error("初回設定ではO2店舗ログインのパスワードも入力してください");
      return;
    }
    setSaving(true);
    try {
      const { error } = await rpc("save_o2_store_availability_settings_v1", {
        p_store_id: storeId,
        p_login_email: normalizedEmail,
        p_password: password,
        p_is_enabled: enabled,
      });
      if (error) throw error;
      toast.success(enabled ? "店舗O2の毎日投稿を有効にしました" : "店舗O2の自動投稿を停止しました");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "店舗O2設定を保存できませんでした");
    } finally {
      setSaving(false);
    }
  };

  const postNow = async () => {
    if (!settings?.credential_configured) {
      toast.error("先にO2店舗ログイン情報を保存してください");
      return;
    }
    if (!window.confirm("本日のO2店舗投稿を実行します。O2の投稿回数を1回消費し、本日は自動投稿されません。続けますか？")) return;
    setPosting(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("ログイン状態を確認できませんでした。再ログインしてください");
      const response = await fetch("/api/automations/o2-store-availability", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ storeId }),
      });
      const payload = await response.json().catch(() => ({})) as { status?: string; reason?: string; error?: string; url?: string };
      if (!response.ok) throw new Error(payload.error || payload.reason || "O2店舗投稿を実行できませんでした");
      if (payload.status === "posted") {
        toast.success("O2店舗へ空き情報を投稿しました");
      } else {
        toast.info(payload.reason || "本日の投稿は実行しませんでした");
      }
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "O2店舗投稿を実行できませんでした");
      await load();
    } finally {
      setPosting(false);
    }
  };

  if (authLoading || storeLoading || loading) {
    return <section className="rounded-xl border bg-card p-5"><div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 size={16} className="animate-spin" />店舗O2設定を読み込んでいます</div></section>;
  }

  const isPostingLocked = settings?.last_status === "posting" || settings?.last_status === "review_required";
  const lastStatus = settings?.last_status ? statusLabel[settings.last_status] || settings.last_status : "投稿なし";

  return (
    <section className="overflow-hidden rounded-xl border border-sky-200 bg-card shadow-sm">
      <div className="border-b border-sky-100 bg-gradient-to-r from-sky-50 to-white px-5 py-4">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
          <div className="flex gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sky-600 text-white"><Store size={20} /></div>
            <div>
              <div className="flex flex-wrap items-center gap-2"><h2 className="font-bold text-slate-950">店舗</h2><span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-800">O2店舗アカウント</span></div>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{store?.name || "この店舗"}の空き情報を、O2の<span className="font-medium text-slate-800">店舗ログイン</span>で毎日1回投稿します。セラピスト個人の同時投稿・魂セラピストは使いません。</p>
            </div>
          </div>
          <Button size="sm" variant="outline" asChild><a href={O2_STORE_LOGIN_URL} target="_blank" rel="noreferrer">店舗O2を開く<ExternalLink size={14} className="ml-1" /></a></Button>
        </div>
      </div>

      <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="space-y-4">
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-950">
            <strong>投稿時刻:</strong> 毎日 11:05（日本時間）。本日の予約・出勤状況から最短の案内時刻を算出し、該当セラピストの写真を1枚添えて投稿します。空きがない日は投稿回数を消費せず見送ります。
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor="o2-store-login-email">O2店舗ログインのメールアドレス</Label><Input id="o2-store-login-email" type="email" autoComplete="email" placeholder="shop@example.jp" value={email} onChange={(event) => setEmail(event.target.value)} disabled={saving || posting} /></div>
            <div className="space-y-1.5"><Label htmlFor="o2-store-login-password">O2店舗ログインのパスワード</Label><Input id="o2-store-login-password" type="password" autoComplete="new-password" placeholder={settings?.credential_configured ? "変更する場合のみ入力" : "初回は入力必須"} value={password} onChange={(event) => setPassword(event.target.value)} disabled={saving || posting} /><p className="text-[11px] text-muted-foreground">保存済みのパスワードは表示しません。</p></div>
          </div>
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
            <input className="sr-only" type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} disabled={saving || posting} />
            {enabled ? <ToggleRight className="mt-0.5 shrink-0 text-emerald-600" size={23} /> : <ToggleLeft className="mt-0.5 shrink-0 text-slate-400" size={23} />}
            <span><span className="font-semibold">O2店舗の毎日投稿を{enabled ? "有効" : "停止"}</span><span className="mt-0.5 block text-xs leading-5 text-muted-foreground">有効にして保存すると、毎日最大1回だけ自動実行します。投稿済み・送信中・要確認状態では再投稿しません。</span></span>
          </label>
          <div className="flex flex-wrap gap-2"><Button onClick={() => void save()} disabled={saving || posting}>{saving && <Loader2 size={15} className="mr-1 animate-spin" />}設定を保存</Button><Button variant="outline" onClick={() => void postNow()} disabled={saving || posting || !settings?.credential_configured || isPostingLocked}>{posting ? <Loader2 size={15} className="mr-1 animate-spin" /> : <Send size={15} className="mr-1" />}今すぐ空き情報を投稿</Button></div>
          {settings?.last_status === "review_required" && <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-800">O2へ送信後の掲載確認ができていないため再送を停止中です。O2店舗の投稿一覧を確認してから、管理者へ復旧を依頼してください。</p>}
        </div>

        <aside className="space-y-3 rounded-lg border bg-slate-50 p-4 text-sm">
          <div><p className="text-xs text-muted-foreground">ログイン情報</p><p className="mt-1 font-medium">{settings?.credential_configured ? "設定済み" : "未設定"}</p></div>
          <div><p className="text-xs text-muted-foreground">直近の結果</p><p className="mt-1 font-medium">{lastStatus}</p><p className="mt-1 text-xs text-muted-foreground">{formatDateTime(settings?.last_posted_at || null)}</p></div>
          {settings?.last_post_url && <a className="inline-flex items-center text-xs font-medium text-primary hover:underline" href={settings.last_post_url} target="_blank" rel="noreferrer">O2の投稿を見る<ExternalLink size={13} className="ml-1" /></a>}
          {settings?.last_error && <p className="break-words rounded-md bg-rose-50 p-2 text-xs leading-5 text-rose-700">{settings.last_error}</p>}
        </aside>
      </div>
    </section>
  );
}
