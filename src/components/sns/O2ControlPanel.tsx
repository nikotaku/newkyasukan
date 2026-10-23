import { useState } from "react";
import {
  AlertTriangle,
  BellRing,
  Check,
  Copy,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useO2Control } from "@/hooks/useO2Control";
import { callO2Control, O2_JOB_LABELS, type O2Request } from "@/lib/o2Control";
import relayScript from "../../../scripts/gmail-o2-verification-sync.gs?raw";

type Cast = {
  cast_id: string;
  cast_name: string;
  o2_created: boolean;
  o2_linkage_requested: boolean;
  credential_configured: boolean;
  o2_login_email: string | null;
};
const stamp = (v: string | null | undefined) =>
  v
    ? new Date(v).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })
    : "未確認";
export function O2RequestList({
  requests,
  storeId,
  onChanged,
}: {
  requests: O2Request[];
  storeId: string;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const approve = async (r: O2Request) => {
    setBusy(r.id);
    try {
      await callO2Control(storeId, "approve", { requestId: r.id });
      toast.success(`${r.display_name}さんの連携を承認しました`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "承認できませんでした");
    } finally {
      setBusy(null);
      onChanged();
    }
  };
  return (
    <div className="space-y-2">
      {requests.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          取得済みの承認待ち申請はありません。
        </p>
      ) : (
        requests.map((r) => (
          <div key={r.id} className="rounded-lg border p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium break-words">{r.display_name}</p>
                <p className="text-xs text-muted-foreground">@{r.username}</p>
              </div>
              <Button
                size="sm"
                onClick={() => void approve(r)}
                disabled={!!busy || r.status !== "pending" || !r.cast_id}
              >
                {busy === r.id ? (
                  <Loader2 size={14} className="mr-1 animate-spin" />
                ) : (
                  <Check size={14} className="mr-1" />
                )}
                {r.status === "approving"
                  ? "承認中"
                  : r.status === "review_required"
                    ? "要確認"
                    : "承認する"}
              </Button>
            </div>
            {!r.cast_id && (
              <p className="text-xs text-amber-700">
                在籍セラピストと未照合です。SNS設定の02ユーザー名を確認してから再取得してください。
              </p>
            )}
            {r.error && <p className="text-xs text-destructive">{r.error}</p>}
            <a
              className="text-xs text-primary underline"
              href={r.profile_url}
              target="_blank"
              rel="noreferrer"
            >
              申請者のプロフィールを確認
            </a>
          </div>
        ))
      )}
    </div>
  );
}
export function O2ControlPanel({ casts }: { casts: Cast[] }) {
  const state = useO2Control();
  const { storeId } = state;
  const [busy, setBusy] = useState<string | null>(null);
  const [mailOpen, setMailOpen] = useState(false);
  const [script, setScript] = useState("");
  const perform = async (
    action: string,
    extra: Record<string, unknown> = {},
  ) => {
    setBusy(String(extra.castId || action));
    try {
      const result = await callO2Control(storeId, action, extra);
      if (result.status === "failed")
        toast.error(
          "02側の取得に失敗しました。表示された理由を確認してください",
        );
      else
        toast.success(
          result.queued ? "処理を受け付けました" : "02連携状況を更新しました",
        );
      await state.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "処理できませんでした");
    } finally {
      setBusy(null);
    }
  };
  const prepareMail = async () => {
    setBusy("mail");
    try {
      const { data, error } = await (
        supabase.rpc as unknown as (
          name: string,
          args: Record<string, unknown>,
        ) => Promise<{ data: string; error: unknown }>
      )("create_o2_mail_relay_token", { p_store_id: storeId });
      if (error || !data) throw new Error("メール連携の設定を作成できません");
      setScript(relayScript.replace("__O2_RELAY_TOKEN__", data));
      setMailOpen(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "設定できません");
    } finally {
      setBusy(null);
    }
  };
  const settings = state.data?.settings;
  const stale =
    settings?.checked_at &&
    Date.now() - new Date(settings.checked_at).getTime() > 15 * 60000;
  return (
    <section
      id="o2-control"
      className="rounded-xl border bg-card p-4 space-y-4 scroll-mt-20"
    >
      <div className="flex flex-wrap justify-between gap-2">
        <div>
          <h3 className="font-semibold flex items-center gap-2">
            <BellRing size={17} />
            02の登録・連携管理
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            店舗の連携申請を5分ごとに確認。ここから承認できます。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={!!busy || state.isLoading}
            onClick={() =>
              void perform("settings", { enabled: !settings?.enabled })
            }
          >
            {settings?.enabled ? "自動確認を停止" : "自動確認を開始"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!!busy}
            onClick={() => void perform("sync")}
          >
            <RefreshCw
              size={14}
              className={busy === "sync" ? "mr-1 animate-spin" : "mr-1"}
            />
            今すぐ確認
          </Button>
        </div>
      </div>
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error.message}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        店舗側の確認：{stamp(settings?.checked_at)} ／ メール受信箱との通信：
        {stamp(settings?.email_checked_at)}
      </p>
      {(settings?.last_error || stale) && (
        <div
          role="alert"
          className="rounded-lg bg-amber-50 text-amber-900 p-3 text-sm"
        >
          <AlertTriangle size={15} className="inline mr-1" />
          {settings?.last_error ||
            "しばらく02の確認が完了していません。「今すぐ確認」を実行してください。"}
        </div>
      )}
      <O2RequestList
        requests={state.data?.requests || []}
        storeId={storeId}
        onChanged={() => void state.refetch()}
      />
      <div className="border-t pt-3 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-sm font-medium">セラピストの登録状況</h4>
          <Button
            size="sm"
            variant="outline"
            disabled={!!busy}
            onClick={() => void prepareMail()}
          >
            Gmail認証メールの連携設定
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          登録メール・ユーザー名・パスワードは下のSNS設定を使います。メール認証と02運営の審査は別々に表示します。
        </p>
        <div className="max-h-96 overflow-y-auto divide-y">
          {casts.map((c) => {
            const job = state.data?.jobs.find((j) => j.cast_id === c.cast_id);
            const active =
              job &&
              ["queued", "running", "awaiting_email"].includes(job.status);
            return (
              <div key={c.cast_id} className="py-3 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{c.cast_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {job
                        ? O2_JOB_LABELS[job.status] || job.status
                        : c.o2_created
                          ? "02作成済み"
                          : "未確認"}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={
                      !!busy ||
                      !!active ||
                      !c.credential_configured ||
                      !c.o2_login_email
                    }
                    onClick={() =>
                      void perform(
                        c.o2_created ||
                          (job &&
                            ["review_required", "awaiting_review"].includes(
                              job.status,
                            ))
                          ? "check"
                          : "register",
                        { castId: c.cast_id },
                      )
                    }
                  >
                    {busy === c.cast_id ? (
                      <Loader2 size={13} className="mr-1 animate-spin" />
                    ) : null}
                    {c.o2_created ||
                    (job &&
                      ["review_required", "awaiting_review"].includes(
                        job.status,
                      ))
                      ? "状態を確認"
                      : "登録を開始"}
                  </Button>
                </div>
                {job?.error && (
                  <p className="text-xs text-destructive">{job.error}</p>
                )}
                {c.o2_created && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={!!busy || !!active}
                      onClick={() =>
                        void perform("profile", { castId: c.cast_id })
                      }
                    >
                      HPのプロフィール・写真を反映
                    </Button>
                    {!c.o2_linkage_requested && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={!!busy || !!active}
                        onClick={() =>
                          void perform("request-link", { castId: c.cast_id })
                        }
                      >
                        店舗連携を申請
                      </Button>
                    )}
                  </div>
                )}
                {!c.credential_configured && (
                  <p className="text-xs text-muted-foreground">
                    下のSNS設定に02ログイン情報を保存してください。
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <Dialog
        open={mailOpen}
        onOpenChange={(open) => {
          setMailOpen(open);
          if (!open) setScript("");
        }}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>認証メールの転送先Gmailに接続</DialogTitle>
          </DialogHeader>
          <p className="text-sm">
            転送先のGoogleアカウントでGoogle Apps
            Scriptを開き、設定用コードを貼り付けて保存し、setupO2MailSyncを1回実行してください。Gmailへのアクセス許可はご自身の画面で行います。
          </p>
          <p className="text-xs text-muted-foreground">
            以降は毎分、自動で認証メールを確認します。コードには店舗専用の接続鍵が含まれます。共有しないでください。
          </p>
          <Button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(script);
                toast.success("設定用コードをコピーしました");
              } catch {
                toast.error(
                  "コピーできませんでした。ブラウザのクリップボード権限を確認してください",
                );
              }
            }}
          >
            <Copy size={14} className="mr-1" />
            設定用コードをコピー
          </Button>
          <Button variant="outline" asChild>
            <a
              href="https://script.google.com/home/start"
              target="_blank"
              rel="noreferrer"
            >
              Google Apps Scriptを開く
            </a>
          </Button>
        </DialogContent>
      </Dialog>
    </section>
  );
}
export function O2ControlAlert() {
  const state = useO2Control();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const requests = state.data?.requests || [];
  const count = requests.filter((r) => r.status === "pending").length;
  const attention =
    requests.some((r) => r.status === "review_required") ||
    state.data?.settings?.last_status === "failed";
  if (!count && !attention) return null;
  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="relative h-8 px-2 text-xs"
        onClick={() => setOpen(true)}
        aria-label={`02の連携申請 ${count}件`}
      >
        <BellRing size={15} />
        <span className="ml-1">02{count ? ` ${count}` : " 要確認"}</span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[85dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>02の連携申請</DialogTitle>
          </DialogHeader>
          {state.data?.settings?.last_error && (
            <p role="alert" className="text-sm text-destructive">
              {state.data.settings.last_error}
            </p>
          )}
          <O2RequestList
            requests={requests}
            storeId={state.storeId}
            onChanged={() => void state.refetch()}
          />
          <Button
            variant="outline"
            onClick={() => {
              setOpen(false);
              navigate("/education?tab=sns#o2-control");
            }}
          >
            登録・認証状況も確認する
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
