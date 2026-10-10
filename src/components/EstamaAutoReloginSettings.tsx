import { useCallback, useEffect, useState } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

type LoginStatus = {
  registered: boolean;
  mail: string | null;
  credentialsSetAt: string | null;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  consecutiveFailures: number;
  lastError: string | null;
};

const rpc = (name: string, args: Record<string, unknown>) =>
  (supabase.rpc as unknown as (fn: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>)(name, args);

const formatJst = (value: string | null) => value
  ? new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value))
  : "—";

/**
 * エステ魂の自動再ログイン：管理画面のメールアドレス・パスワードを Vault に保存する。
 * ログインが切れたら（2か月ほどで切れる）、5分以内に自動でログインし直して止まっていた作業を再開する。
 * 画面には「登録済み」とメールの一部だけ出す。パスワードは表示しない。
 */
export function EstamaAutoReloginSettings({ storeId, onSaved }: { storeId: string; onSaved?: () => void }) {
  const { toast } = useToast();
  const [status, setStatus] = useState<LoginStatus | null>(null);
  const [editing, setEditing] = useState(false);
  const [mail, setMail] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await rpc("get_estama_admin_login_status", { p_store_id: storeId });
    if (!error) setStatus(data as LoginStatus);
  }, [storeId]);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    setSaving(true);
    const { data, error } = await rpc("save_estama_admin_login", { p_store_id: storeId, p_mail: mail.trim(), p_password: password });
    setSaving(false);
    if (error) {
      toast({ title: "登録できませんでした", description: error.message, variant: "destructive" });
      return;
    }
    setStatus(data as LoginStatus);
    setPassword("");
    setEditing(false);
    toast({ title: "ログイン情報を登録しました", description: "ログインが切れていれば、5分以内に自動でログインし直します" });
    onSaved?.();
  };

  const showForm = editing || !status?.registered;
  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-center gap-2">
        <KeyRound className="h-5 w-5 text-primary" />
        <span className="font-semibold">自動で再ログイン</span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        エステ魂のログインは2か月ほどで切れます。店舗ログインのメールアドレス・パスワードを登録しておくと、切れたときに自動でログインし直し、
        空き枠の更新・今すぐご案内・同期を止めずに続けます（暗号化して保存し、画面には表示しません）。
      </p>

      {status?.registered && !editing && (
        <div className="mt-3 space-y-1 text-xs">
          <p>登録済み：<span className="font-medium">{status.mail}</span>（{formatJst(status.credentialsSetAt)}）</p>
          <p className="text-muted-foreground">最後に自動ログイン：{formatJst(status.lastSuccessAt)}</p>
          {status.consecutiveFailures > 0 && (
            <p className="text-destructive">
              自動ログインに{status.consecutiveFailures}回続けて失敗（{formatJst(status.lastAttemptAt)}）：{status.lastError}
            </p>
          )}
          <Button size="sm" variant="outline" className="mt-1" onClick={() => setEditing(true)}>登録し直す</Button>
        </div>
      )}

      {showForm && (
        <div className="mt-3 space-y-2">
          <div className="space-y-1">
            <Label htmlFor="estama-login-mail" className="text-xs">メールアドレス（エステ魂の店舗ログイン）</Label>
            <Input id="estama-login-mail" type="email" autoComplete="off" value={mail} onChange={(event) => setMail(event.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="estama-login-password" className="text-xs">パスワード</Label>
            <Input id="estama-login-password" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} />
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => void save()} disabled={saving || !mail.trim() || !password}>
              {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}登録する
            </Button>
            {status?.registered && <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setPassword(""); }}>やめる</Button>}
          </div>
          <p className="text-[11px] text-muted-foreground">登録できるのは店長・オーナーだけです。</p>
        </div>
      )}
    </div>
  );
}
