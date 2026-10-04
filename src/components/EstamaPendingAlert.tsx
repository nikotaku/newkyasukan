import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Loader2, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAdminStore } from "@/hooks/useAdminStore";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { startEstamaProfileSync, startQueuedEstamaProfileSync } from "@/lib/estamaAutomation";

// セラピストのプロフィール変更は、まずキャスカン（HP）に保存される。エステ魂（エスたま）への反映は
// 裏の定期実行（pg_cron estama-profile-sync-every-minute → Vercel の管理鍵で実行）が進める。
// それでも反映待ちが残っているときは、管理画面を開いている端末からバックグラウンド反映を始める（予備）。
// 左下には「反映中」「ログイン切れ」「反映できなかった変更」だけを出す。

type Job = {
  id: string;
  job_type: string;
  status: string;
  cast_id: string | null;
  error_message: string | null;
  created_at: string;
  available_at?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
};

const ACTIVE_POLL_MS = 15_000;
const IDLE_POLL_MS = 60_000;
// 普段は裏の定期実行（毎分）が反映する。それでも3分残っているときだけ、この画面から始める（予備）
const GRACE_MS = 3 * 60_000;
// 同じ端末の複数のタブ・画面から続けて始めないための間隔
const KICK_INTERVAL_MS = 60_000;
// 関数の時間切れで「実行中」のまま止まったとみなす時間（サーバー側で再開する）
const STALE_RUNNING_MS = 7 * 60_000;
const FAILED_WINDOW_MS = 24 * 60 * 60_000;
const DISMISS_KEY = "estama-pending-dismissed";
const kickKey = (storeId: string) => `estama-auto-kick:${storeId}`;

const readDismissed = () => {
  try {
    return new Set<string>(JSON.parse(sessionStorage.getItem(DISMISS_KEY) || "[]"));
  } catch {
    return new Set<string>();
  }
};

const readLastKick = (storeId: string) => {
  try {
    return Number(localStorage.getItem(kickKey(storeId)) || 0);
  } catch {
    return 0;
  }
};

const writeLastKick = (storeId: string, at: number) => {
  try {
    localStorage.setItem(kickKey(storeId), String(at));
  } catch {
    // 保存できなくても、この画面の間は ref で間隔を空ける
  }
};

// 毎時40分の空き枠更新の前後（27〜42分）はサーバー側で始めないので、こちらからも呼ばない
const inQuietWindow = (now: Date) => now.getUTCMinutes() >= 27 && now.getUTCMinutes() <= 42;

const formatNames = (names: string[]) =>
  `${names.slice(0, 3).join("・")}${names.length > 3 ? ` ほか${names.length - 3}人` : ""}`;

export function EstamaPendingAlert() {
  const { store } = useAdminStore();
  const { toast } = useToast();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [retrying, setRetrying] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(readDismissed);
  const [now, setNow] = useState(() => Date.now());
  const watched = useRef<Map<string, string>>(new Map());
  const lastKick = useRef(0);
  const kicking = useRef(false);

  const load = useCallback(async () => {
    if (!store?.id) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;
    const response = await fetch(`/api/automations/estama?storeId=${encodeURIComponent(store.id)}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    }).catch(() => null);
    if (!response?.ok) return;
    const body = await response.json().catch(() => ({})) as { jobs?: Job[] };
    const profileJobs = (body.jobs || []).filter((job) => job.job_type === "estama_register_cast");
    const castIds = [...new Set(profileJobs.map((job) => job.cast_id).filter((id): id is string => Boolean(id)))];
    const nextNames = new Map<string, string>();
    if (castIds.length) {
      const { data } = await supabase.from("casts").select("id,name").in("id", castIds);
      for (const cast of data || []) nextNames.set(cast.id, cast.name);
    }

    // 反映中に見ていた変更が終わったら知らせる
    for (const job of profileJobs) {
      const castName = (job.cast_id && nextNames.get(job.cast_id)) || "セラピスト";
      if (!watched.current.has(job.id)) continue;
      if (job.status === "completed") {
        toast({ title: `エスたまに反映しました（${castName}）` });
        watched.current.delete(job.id);
      } else if (job.status === "failed") {
        toast({ title: `エスたまに反映できませんでした（${castName}）`, description: job.error_message || undefined, variant: "destructive" });
        watched.current.delete(job.id);
      }
    }
    for (const job of profileJobs) {
      if (job.status === "queued" || job.status === "running") {
        watched.current.set(job.id, job.status);
      }
    }

    setNames(nextNames);
    setJobs(profileJobs);
    setNow(Date.now());
  }, [store?.id, toast]);

  const castName = (job: Job) => (job.cast_id && names.get(job.cast_id)) || "セラピスト";

  const running = jobs.filter((job) => (
    job.status === "running" && now - new Date(job.started_at || job.created_at).getTime() < STALE_RUNNING_MS
  ));
  const stale = jobs.filter((job) => (
    job.status === "running" && now - new Date(job.started_at || job.created_at).getTime() >= STALE_RUNNING_MS
  ));
  const queued = jobs.filter((job) => job.status === "queued");
  const ready = queued.filter((job) => (
    now - new Date(job.created_at).getTime() > GRACE_MS
    && (!job.available_at || new Date(job.available_at).getTime() <= now)
  ));
  const needsLogin = jobs.filter((job) => job.status === "waiting_for_login");
  // セラピストごとに一番新しい反映が失敗したまま（24時間以内）のもの
  const failed = (() => {
    const latest = new Map<string, Job>();
    for (const job of jobs) {
      if (!job.cast_id || latest.has(job.cast_id)) continue;
      latest.set(job.cast_id, job);
    }
    return [...latest.values()].filter((job) => (
      job.status === "failed" && now - new Date(job.finished_at || job.created_at).getTime() < FAILED_WINDOW_MS
    ));
  })();
  const active = [...running, ...stale, ...queued];
  const shouldKick = (ready.length > 0 || stale.length > 0) && running.length === 0 && needsLogin.length === 0;

  // 反映待ちがあれば、サーバー側のバックグラウンド反映を自動で始める
  useEffect(() => {
    if (!store?.id || !shouldKick || kicking.current) return;
    const current = Date.now();
    if (inQuietWindow(new Date(current))) return;
    if (current - Math.max(lastKick.current, readLastKick(store.id)) < KICK_INTERVAL_MS) return;
    kicking.current = true;
    lastKick.current = current;
    writeLastKick(store.id, current);
    startQueuedEstamaProfileSync(store.id)
      .catch((error) => console.warn("エスたまへの自動反映を始められませんでした", error))
      .finally(() => {
        kicking.current = false;
        window.setTimeout(load, 5_000);
      });
  }, [store?.id, shouldKick, now, load]);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, active.length ? ACTIVE_POLL_MS : IDLE_POLL_MS);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [load, active.length]);

  if (!store?.id) return null;

  const dismiss = (ids: string[]) => {
    const next = new Set([...dismissed, ...ids]);
    setDismissed(next);
    try {
      sessionStorage.setItem(DISMISS_KEY, JSON.stringify([...next]));
    } catch {
      // 保存できなくても、この画面の間は閉じたままにする
    }
  };

  const retry = async () => {
    setRetrying(true);
    try {
      await Promise.all(failed.map((job) => job.cast_id
        ? startEstamaProfileSync({ storeId: store.id, castId: job.cast_id })
        : Promise.resolve(null)));
      toast({ title: "エスたまへの反映をもう一度始めました", description: "画面を閉じても続きます" });
    } catch (error) {
      toast({
        title: "エスたまへの反映を始められませんでした",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setRetrying(false);
      window.setTimeout(load, 3_000);
    }
  };

  const visibleLogin = needsLogin.filter((job) => !dismissed.has(job.id));
  const visibleActive = active.filter((job) => !dismissed.has(job.id));
  const visibleFailed = failed.filter((job) => !dismissed.has(job.id));
  const waitingForQuietWindow = inQuietWindow(new Date(now)) && running.length === 0;

  const closeButton = (ids: string[]) => (
    <button
      type="button"
      onClick={() => dismiss(ids)}
      className="shrink-0 p-0.5 text-muted-foreground hover:text-foreground"
      aria-label="閉じる"
      title="閉じる（この画面を開いている間は表示しない）"
    >
      <X size={16} />
    </button>
  );

  return (
    <>
      {visibleLogin.length > 0 && (
        <div role="alert" className="w-full rounded-xl border border-amber-400/70 bg-card p-3 shadow-xl">
          <div className="flex items-start gap-2">
            <RefreshCw size={16} className="mt-0.5 shrink-0 text-amber-500" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">エスたまに反映していない変更があります</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                HPには反映済みです。{formatNames([...new Set(visibleLogin.map(castName))])}のプロフィール（{visibleLogin.length}件）
              </p>
              <p className="mt-1.5 text-xs text-destructive">
                エスたまのログインが切れています。
                <Link to="/staff" className="underline">キャスト管理</Link>の「エスたま自動化」から再ログインしてください
              </p>
            </div>
            {closeButton(visibleLogin.map((job) => job.id))}
          </div>
        </div>
      )}

      {visibleLogin.length === 0 && visibleActive.length > 0 && (
        <div role="status" className="w-full rounded-xl border border-sky-400/60 bg-card p-3 shadow-xl">
          <div className="flex items-start gap-2">
            <Loader2 size={16} className="mt-0.5 shrink-0 animate-spin text-sky-500" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">エスたまに自動で反映しています</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {formatNames([...new Set(visibleActive.map(castName))])}のプロフィール（{visibleActive.length}件）。
                {waitingForQuietWindow
                  ? "毎時40分の空き枠更新が終わってから反映します。"
                  : "1件1〜2分かかります。"}
                画面を閉じても続きます。
              </p>
            </div>
            {closeButton(visibleActive.map((job) => job.id))}
          </div>
        </div>
      )}

      {visibleFailed.length > 0 && (
        <div role="alert" className="w-full rounded-xl border border-rose-400/70 bg-card p-3 shadow-xl">
          <div className="flex items-start gap-2">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-rose-500" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">エスたまに反映できなかった変更があります</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                HPには反映済みです。{formatNames([...new Set(visibleFailed.map(castName))])}のプロフィール
              </p>
              {visibleFailed[0]?.error_message && (
                <p className="mt-1 text-[11px] text-rose-600 line-clamp-2">{visibleFailed[0].error_message}</p>
              )}
              <Button size="sm" className="mt-2 h-8" onClick={retry} disabled={retrying}>
                {retrying ? <Loader2 size={14} className="mr-1 animate-spin" /> : <RefreshCw size={14} className="mr-1" />}
                もう一度反映する
              </Button>
            </div>
            {closeButton(visibleFailed.map((job) => job.id))}
          </div>
        </div>
      )}
    </>
  );
}
