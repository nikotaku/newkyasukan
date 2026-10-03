import { useCallback, useEffect, useState } from "react";
import { Bell, BellOff, BellRing, CheckCircle2, Copy, Loader2, Send, Share, SquarePlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  disableTherapistPush,
  enableTherapistPush,
  getTherapistPushStatus,
  isIOS,
  isPushSupported,
  isStandalone,
  sendTherapistTestPush,
  type TherapistPushStatus,
} from "@/lib/therapistPush";

// マイページの一番上に出す「予約の通知」カード。
// 予約の確定・変更・キャンセルはこのアプリ（ホーム画面に追加したマイページ）へのプッシュ通知だけで届くので、
// まだ設定していない人には目立つ形で手順を出し、設定済みなら小さく「オン」とだけ出す。

const isInAppBrowser = () => typeof navigator !== "undefined" && /Line\/|FBAN|FBAV|Instagram/i.test(navigator.userAgent);

export function TherapistPushCard({ token }: { token: string }) {
  const supported = isPushSupported();
  const ios = isIOS();
  const standalone = isStandalone();
  const inApp = isInAppBrowser();
  const needsHomeScreen = (ios && !standalone) || inApp;

  const [status, setStatus] = useState<TherapistPushStatus | null>(null);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(supported ? Notification.permission : "unsupported");
  const [busy, setBusy] = useState<"enable" | "disable" | "test" | null>(null);
  const [showSteps, setShowSteps] = useState(false);

  const refresh = useCallback(async () => {
    if (supported) setPermission(Notification.permission);
    try {
      setStatus(await getTherapistPushStatus(token));
    } catch {
      setStatus({ devices: 0, thisDevice: false });
    }
  }, [supported, token]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const run = async (kind: NonNullable<typeof busy>, action: () => Promise<void>) => {
    setBusy(kind);
    try {
      await action();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
      refresh();
    }
  };

  const enable = () => run("enable", async () => {
    await enableTherapistPush(token);
    const result = await sendTherapistTestPush(token).catch(() => null);
    toast.success(result?.sent ? "通知をオンにしました。テスト通知が届きます" : "通知をオンにしました");
  });

  const test = () => run("test", async () => {
    const result = await sendTherapistTestPush(token);
    if (result.sent) toast.success("テスト通知を送りました。数秒で届きます");
    else toast.error("送れませんでした。通知をいったんオフにして、もう一度オンにしてください");
  });

  const disable = () => run("disable", async () => {
    await disableTherapistPush(token);
    toast.success("この端末の通知をオフにしました");
  });

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success("URLをコピーしました。Safari（Androidは Chrome）に貼り付けて開いてください");
    } catch {
      toast.error("コピーできませんでした");
    }
  };

  if (!status) return null;

  // 設定済み：小さく出す
  if (status.thisDevice) {
    return (
      <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/5 px-4 py-2.5 flex items-center gap-2">
        <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
        <p className="text-sm flex-1 min-w-0">
          <span className="font-semibold">予約の通知：オン</span>
          <span className="text-xs text-muted-foreground ml-1">（この端末）</span>
        </p>
        <Button size="sm" variant="ghost" className="h-8 px-2" onClick={test} disabled={busy !== null}>
          {busy === "test" ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          <span className="ml-1 text-xs">テスト</span>
        </Button>
        <Button size="sm" variant="ghost" className="h-8 px-2 text-muted-foreground" onClick={disable} disabled={busy !== null} aria-label="通知をオフにする">
          {busy === "disable" ? <Loader2 size={14} className="animate-spin" /> : <BellOff size={14} />}
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border-2 border-amber-500/60 bg-amber-500/5 overflow-hidden">
      <div className="px-4 pt-3 pb-1 flex items-center gap-2">
        <BellRing size={18} className="text-amber-600" />
        <span className="font-bold text-sm">予約の通知をオンにしてください</span>
      </div>
      <div className="px-4 pb-4 space-y-3">
        <p className="text-xs text-muted-foreground leading-relaxed">
          新しい予約・予約の変更・キャンセルは、このマイページの<b className="text-foreground">スマホ通知</b>でお知らせします。
          {status.devices > 0
            ? `（ほかの端末${status.devices}台では受け取る設定になっています）`
            : "設定していないと予約のお知らせが届きません。"}
        </p>

        {needsHomeScreen ? (
          <div className="rounded-lg bg-background/80 border p-3 space-y-2">
            {inApp ? (
              <>
                <p className="text-sm font-semibold">LINEなどのアプリ内では設定できません</p>
                <p className="text-xs text-muted-foreground">
                  URLをコピーして、{ios ? "Safari" : "Chrome"}に貼り付けて開いてから、もう一度このカードの手順で設定してください。
                </p>
                <Button size="sm" variant="outline" onClick={copyUrl}>
                  <Copy size={14} className="mr-1" />このページのURLをコピー
                </Button>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold">まずホーム画面に追加します（iPhone）</p>
                <ol className="list-decimal pl-5 space-y-1.5 text-sm">
                  <li>画面下の <Share size={14} className="inline -mt-0.5" />（共有ボタン）をタップ</li>
                  <li><SquarePlus size={14} className="inline -mt-0.5" />「ホーム画面に追加」→ 名前はそのまま「追加」</li>
                  <li>ホーム画面にできた <b>艶華 マイページ</b> のアイコンから開く</li>
                  <li>このカードの「通知をオンにする」→「許可」</li>
                </ol>
                <p className="text-[11px] text-muted-foreground">
                  iOS 16.4 以降が必要です。Safariで開いたままでは通知を受け取れません。共有ボタンが見当たらないときは、画面を少し下にスクロールすると出てきます。
                </p>
              </>
            )}
          </div>
        ) : !supported ? (
          <p className="text-sm text-destructive">
            このブラウザは通知に対応していません。iPhoneは Safari、Androidは Chrome で開いてください。
          </p>
        ) : permission === "denied" ? (
          <p className="text-sm text-destructive">
            通知がブロックされています。{ios ? "iPhoneの「設定」→「通知」→「艶華 マイページ」" : "スマホの設定 → アプリ → Chrome（または 艶華 マイページ）→ 通知"}
            で許可してから、もう一度開いてください。
          </p>
        ) : (
          <>
            <Button className="w-full h-11 text-base" onClick={enable} disabled={busy !== null}>
              {busy === "enable" ? <Loader2 size={18} className="mr-1.5 animate-spin" /> : <Bell size={18} className="mr-1.5" />}
              通知をオンにする
            </Button>
            {!standalone && (
              <div>
                <button type="button" onClick={() => setShowSteps((open) => !open)} className="text-xs text-primary underline">
                  ホーム画面に追加するには（おすすめ）
                </button>
                {showSteps && (
                  <ol className="mt-1.5 list-decimal pl-5 space-y-1 text-xs text-muted-foreground">
                    <li>Chromeの右上の「︙」をタップ</li>
                    <li>「ホーム画面に追加」または「アプリをインストール」</li>
                    <li>ホーム画面の <b>艶華 マイページ</b> から開けるようになります</li>
                  </ol>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
