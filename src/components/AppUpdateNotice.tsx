import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { bundlePathFromHtml, hasNewerBundle } from "@/lib/appVersion";

const CHECK_INTERVAL_MS = 5 * 60 * 1000;

/** 今読み込んでいる本体のファイル（開発中は無いので null） */
function loadedBundlePath(): string | null {
  const script = document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/index-"]');
  if (!script?.src) return null;
  try {
    return new URL(script.src).pathname;
  } catch {
    return null;
  }
}

/**
 * 新しい版が公開されたら「新しいバージョンがあります［更新する］」を出す。
 * ホーム画面に追加した管理アプリ・マイページ（iPhone）はアプリを閉じきるまで古い画面のままなので、
 * 画面に戻ったとき・5分ごとに公開中の index.html を見て比べる。勝手に読み込み直さない（入力中の内容が消えるため）。
 * 置き場所：管理画面のヘッダー（DashboardHeader）とセラピストのマイページ（TherapistPortal）。
 */
export function AppUpdateNotice() {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    const current = loadedBundlePath();
    if (!current) return;
    let stopped = false;

    const check = async () => {
      if (stopped || document.visibilityState !== "visible") return;
      try {
        const res = await fetch(`/?_v=${Date.now()}`, { cache: "no-store" });
        if (!res.ok) return;
        if (hasNewerBundle(current, bundlePathFromHtml(await res.text()))) setAvailable(true);
      } catch {
        // 通信できないときは次の機会に見る
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    const timer = window.setInterval(() => void check(), CHECK_INTERVAL_MS);
    void check();
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.clearInterval(timer);
    };
  }, []);

  if (!available) return null;

  return (
    <div
      role="status"
      className="fixed left-1/2 z-[100] flex w-[calc(100vw-2rem)] max-w-sm -translate-x-1/2 items-center gap-3 rounded-xl border bg-card px-4 py-3 text-sm text-card-foreground shadow-lg"
      style={{ top: "calc(env(safe-area-inset-top, 0px) + 0.75rem)" }}
    >
      <span className="flex-1 font-medium">新しいバージョンがあります</span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
      >
        <RefreshCw className="h-3.5 w-3.5" />
        更新する
      </button>
    </div>
  );
}
