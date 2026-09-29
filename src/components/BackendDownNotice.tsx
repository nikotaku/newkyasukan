import { useEffect, useState } from "react";
import { AlertTriangle, MessageCircle, Phone, RotateCw } from "lucide-react";
import { useStoreContact } from "@/hooks/useStoreContact";
import { isBackendDown, probeBackend } from "@/lib/backendStatus";

// DB（Supabase）が止まっているときだけ出すメンテナンス中の案内。
// 出勤・空き枠が「出勤なし」に見えるのを防ぎ、ご予約をお電話・LINEへ案内する。
// 1分ごとに確かめ直し、つながったら「再読み込み」を出す（DBが戻れば何もしなくても消える）。
const RECHECK_MS = 60_000;

export function BackendDownNotice() {
  const [state, setState] = useState<"ok" | "down" | "recovered">("ok");
  const [open, setOpen] = useState(true);
  const { phoneDisplay, telHref, lineUrl } = useStoreContact();

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    isBackendDown().then((down) => {
      if (cancelled || !down) return;
      setState("down");
      timer = setInterval(async () => {
        if (!(await probeBackend()) || cancelled) return;
        clearInterval(timer);
        setState("recovered");
      }, RECHECK_MS);
    });
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, []);

  if (state === "ok") return null;

  if (state === "recovered") {
    return (
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="fixed top-2 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-1.5 rounded-full bg-emerald-600 px-4 py-2 text-xs font-medium text-white shadow-lg"
      >
        <RotateCw size={14} />
        復旧しました。タップして再読み込み
      </button>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed top-2 left-1/2 -translate-x-1/2 z-[100] flex max-w-[calc(100vw-7rem)] items-center gap-1.5 rounded-full border border-amber-400/60 bg-neutral-900/95 px-3 py-1.5 text-[11px] font-medium text-amber-200 shadow-lg"
      >
        <AlertTriangle size={13} className="shrink-0" />
        <span className="truncate">メンテナンス中｜ご予約はお電話・LINEで</span>
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="backend-down-title">
      <div className="w-full max-w-sm rounded-2xl border border-amber-400/40 bg-neutral-900 p-5 text-white shadow-2xl">
        <div className="flex items-center gap-2 text-amber-300">
          <AlertTriangle size={20} />
          <h2 id="backend-down-title" className="text-base font-bold">ただいまシステムメンテナンス中です</h2>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-neutral-200">
          出勤情報・空き枠の表示とWeb予約が、一時的にご利用いただけません。
          ご予約・お問い合わせは<strong className="text-white">お電話またはLINE</strong>で承ります。
          ご迷惑をおかけして申し訳ございません。
        </p>
        <div className="mt-4 grid gap-2">
          <a href={telHref} className="flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-3 text-sm font-bold text-neutral-900">
            <Phone size={16} />
            電話する（{phoneDisplay}）
          </a>
          <a href={lineUrl} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 rounded-xl bg-[#06C755] px-4 py-3 text-sm font-bold text-white">
            <MessageCircle size={16} />
            LINEで予約・問い合わせ
          </a>
          <button type="button" onClick={() => setOpen(false)} className="rounded-xl px-4 py-2 text-xs text-neutral-400 underline-offset-2 hover:underline">
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
