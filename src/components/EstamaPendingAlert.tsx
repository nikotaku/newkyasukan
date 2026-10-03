import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAdminStore } from "@/hooks/useAdminStore";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { runQueuedEstamaAutomation } from "@/lib/estamaAutomation";

// セラピストのプロフィール変更は、まずキャスカン（HP）に保存される。エステ魂（エスたま）への反映が
// 終わっていない変更があれば、管理画面の左下に知らせて、ボタン1つで反映できるようにする。
// 反映はログイン中のスタッフの権限で行う（Vercelの裏側の自動同期は管理鍵が無いので動かない）。

type Job = {
  id: string;
  job_type: string;
  status: string;
  cast_id: string | null;
  error_message: string | null;
  created_at: string;
};

type Pending = { id: string; castName: string; status: string };

const POLL_MS = 60_000;
// 保存した直後は、保存画面が自分で反映を始めるので少し待ってから知らせる
const GRACE_MS = 90_000;
const DISMISS_KEY = "estama-pending-dismissed";

const readDismissed = () => {
  try {
    return new Set<string>(JSON.parse(sessionStorage.getItem(DISMISS_KEY) || "[]"));
  } catch {
    return new Set<string>();
  }
};

export function EstamaPendingAlert() {
  const { store } = useAdminStore();
  const { toast } = useToast();
  const [pending, setPending] = useState<Pending[]>([]);
  const [running, setRunning] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(readDismissed);

  const load = useCallback(async () => {
    if (!store?.id) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;
    const response = await fetch(`/api/automations/estama?storeId=${encodeURIComponent(store.id)}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    }).catch(() => null);
    if (!response?.ok) return;
    const body = await response.json().catch(() => ({})) as { jobs?: Job[] };
    const now = Date.now();
    const jobs = (body.jobs || []).filter((job) => (
      job.job_type === "estama_register_cast"
      && (job.status === "queued" || job.status === "waiting_for_login")
      && now - new Date(job.created_at).getTime() > GRACE_MS
    ));
    const castIds = [...new Set(jobs.map((job) => job.cast_id).filter((id): id is string => Boolean(id)))];
    const names = new Map<string, string>();
    if (castIds.length) {
      const { data } = await supabase.from("casts").select("id,name").in("id", castIds);
      for (const cast of data || []) names.set(cast.id, cast.name);
    }
    setPending(jobs.map((job) => ({
      id: job.id,
      status: job.status,
      castName: (job.cast_id && names.get(job.cast_id)) || "セラピスト",
    })));
  }, [store?.id]);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, POLL_MS);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  const visible = pending.filter((item) => !dismissed.has(item.id));
  if (!store?.id || !visible.length) return null;

  const needsLogin = visible.some((item) => item.status === "waiting_for_login");
  const names = [...new Set(visible.map((item) => item.castName))];

  const dismiss = () => {
    const next = new Set([...dismissed, ...visible.map((item) => item.id)]);
    setDismissed(next);
    try {
      sessionStorage.setItem(DISMISS_KEY, JSON.stringify([...next]));
    } catch {
      // 保存できなくても、この画面の間は閉じたままにする
    }
  };

  const reflect = async () => {
    setRunning(true);
    try {
      const result = await runQueuedEstamaAutomation(store.id);
      const results = result.results || [];
      const failed = results.filter((item) => item.status !== "completed");
      if (!results.length) {
        toast({ title: "反映する変更はありませんでした" });
      } else if (failed.length) {
        toast({
          title: `エスたまに反映できなかった変更があります（${failed.length}件）`,
          description: failed[0]?.error || "キャスト管理の「エスたま自動化」で状態を確認してください",
          variant: "destructive",
        });
      } else {
        toast({ title: `エスたまに反映しました（${results.length}件）` });
      }
    } catch (error) {
      toast({
        title: "エスたまに反映できませんでした",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setRunning(false);
      load();
    }
  };

  return (
    <div
      role="status"
      className="fixed bottom-4 left-4 md:left-[256px] z-50 w-[340px] max-w-[calc(100vw-6.5rem)] rounded-xl border border-amber-400/70 bg-card p-3 shadow-xl"
    >
      <div className="flex items-start gap-2">
        <RefreshCw size={16} className="mt-0.5 shrink-0 text-amber-500" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">エスたまに反映していない変更があります</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            HPには反映済みです。{names.slice(0, 3).join("・")}{names.length > 3 ? ` ほか${names.length - 3}人` : ""}のプロフィール（{visible.length}件）
          </p>
          {needsLogin ? (
            <p className="mt-1.5 text-xs text-destructive">
              エスたまのログインが切れています。
              <Link to="/staff" className="underline">キャスト管理</Link>の「エスたま自動化」から再ログインしてください
            </p>
          ) : (
            <Button size="sm" className="mt-2 h-8" onClick={reflect} disabled={running}>
              {running ? <Loader2 size={14} className="mr-1 animate-spin" /> : <RefreshCw size={14} className="mr-1" />}
              {running ? "反映中…（1〜2分）" : "エスたまに反映する"}
            </Button>
          )}
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 p-0.5 text-muted-foreground hover:text-foreground"
          aria-label="あとで"
          title="あとで（この画面を開いている間は表示しない）"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
