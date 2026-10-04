import { useEffect, useState } from "react";
import { Check, Copy, ExternalLink, Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  SNS_SETUP_GUIDE_IMAGES,
  bioLength,
  buildSnsBio,
  buildSnsFirstPost,
  callSnsRpc,
  hasUnseenSnsNotice,
  type TherapistSnsAccountData,
} from "@/lib/therapistSns";

// セラピストのマイページの「SNSアカウント」。お店が用意した X・O2 のログインID・パスワードと、
// 設定マニュアル（画像4枚：Xのトップ → O2のトップ → 自己紹介 → 初回ポスト）、コピーして使える例文を出す。
// データと例文は src/lib/therapistSns.ts。

function CopyRow({ label, value, secret = false }: { label: string; value: string | null | undefined; secret?: boolean }) {
  const [visible, setVisible] = useState(!secret);
  const [copied, setCopied] = useState(false);
  if (!value) return null;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("コピーできませんでした");
    }
  };
  return (
    <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <p className="font-mono text-sm break-all">{visible ? value : "••••••••"}</p>
      </div>
      {secret && (
        <button type="button" onClick={() => setVisible((open) => !open)} className="p-1.5 text-muted-foreground" aria-label={visible ? "隠す" : "表示する"}>
          {visible ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      )}
      <button type="button" onClick={copy} className="p-1.5 text-primary" aria-label={`${label}をコピー`}>
        {copied ? <Check size={16} /> : <Copy size={16} />}
      </button>
    </div>
  );
}

function TemplateBox({ title, text, hint }: { title: string; text: string; hint?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success(`${title}をコピーしました`);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("コピーできませんでした");
    }
  };
  return (
    <div className="rounded-xl border bg-card p-4 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">{title}</p>
        <Button size="sm" variant="outline" className="h-8" onClick={copy}>
          {copied ? <Check size={14} className="mr-1" /> : <Copy size={14} className="mr-1" />}コピー
        </Button>
      </div>
      <pre className="whitespace-pre-wrap rounded-lg bg-muted/50 p-3 text-xs leading-relaxed font-sans">{text}</pre>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function TherapistSnsAccount({
  token,
  castName,
  bookingUrl,
  account,
  loading,
  onSeen,
}: {
  token: string;
  castName: string;
  bookingUrl: string;
  account: TherapistSnsAccountData | null;
  loading: boolean;
  onSeen: () => void;
}) {
  // お店からのお知らせを開いたら「見た」にする
  useEffect(() => {
    if (!hasUnseenSnsNotice(account)) return;
    callSnsRpc("mark_therapist_sns_setup_seen", { p_token: token }).then(({ error }) => {
      if (!error) onSeen();
    });
  }, [account, token, onSeen]);

  if (loading && !account) {
    return <div className="py-12 text-center"><Loader2 className="h-6 w-6 animate-spin text-primary mx-auto" /></div>;
  }

  const x = account?.x;
  const o2 = account?.o2;
  const bio = buildSnsBio(castName, bookingUrl);
  const firstPost = buildSnsFirstPost(castName);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-4">
        <p className="font-bold text-sm">お店で X と O2 のアカウントを用意しました</p>
        <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
          下のIDとパスワードでログインして、マニュアルの順に
          <b className="text-foreground">①Xのトップ ②O2のトップ ③自己紹介 ④初回ポスト</b>
          を設定してください。終わったらお店に「設定できました」と連絡してください。
        </p>
      </div>

      {!x && !o2 && (
        <div className="rounded-xl border bg-card py-10 text-center text-sm text-muted-foreground">
          まだアカウントの準備中です。お店からのお知らせをお待ちください
        </div>
      )}

      {x && (
        <div className="rounded-xl border bg-card p-4 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="font-bold text-sm">𝕏（旧Twitter）</p>
            <Button size="sm" variant="outline" className="h-8" asChild>
              <a href="https://x.com/i/flow/login" target="_blank" rel="noopener noreferrer"><ExternalLink size={14} className="mr-1" />Xを開く</a>
            </Button>
          </div>
          <CopyRow label="ログインID（ユーザー名）" value={x.login_id ? `@${x.login_id.replace(/^@/, "")}` : null} />
          <CopyRow label="パスワード" value={x.password} secret />
          {!x.password && <p className="text-[11px] text-muted-foreground">パスワードはお店に確認してください</p>}
        </div>
      )}

      {o2 && (
        <div className="rounded-xl border bg-card p-4 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="font-bold text-sm">O2（ゼロツー）</p>
            <Button size="sm" variant="outline" className="h-8" asChild>
              <a href={o2.profile_url || "https://m-sns.net/"} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} className="mr-1" />O2を開く</a>
            </Button>
          </div>
          <CopyRow label="ログイン用メールアドレス" value={o2.login_email} />
          <CopyRow label="ID" value={o2.login_id} />
          <CopyRow label="パスワード" value={o2.password} secret />
        </div>
      )}

      <p className="text-[11px] text-muted-foreground px-1">
        ログイン情報は他の人に教えないでください。パスワードを変えたときは、お店にも知らせてください。
      </p>

      <div className="space-y-3">
        <p className="font-bold text-sm px-1">設定マニュアル</p>
        {SNS_SETUP_GUIDE_IMAGES.map((image) => (
          <a key={image.src} href={image.src} target="_blank" rel="noopener noreferrer" className="block">
            <img src={image.src} alt={image.alt} loading="lazy" className="w-full rounded-xl border shadow-sm" />
          </a>
        ))}
      </div>

      <TemplateBox
        title="自己紹介（BIO）の例文"
        text={bio}
        hint={`Xは160文字まで（この例文は${bioLength(bio)}文字）。予約リンクはあなた専用のものが入っています。O2は少し長めに書き足してください`}
      />
      <TemplateBox
        title="初回ポストの例文"
        text={firstPost}
        hint="「◯月◯日」を自分の出勤日に変えて、写真を1〜2枚つけて投稿。投稿したら「…」→「プロフィールに固定する」"
      />
    </div>
  );
}
