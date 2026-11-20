import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAdminStore } from "@/hooks/useAdminStore";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

// SNS連携管理の「本人のXの読み取り」：店長アカウント（X・店長）のキーで、各セラピストのXの投稿を読む状況。
// 読んだ投稿は露出ノルマの「本人投稿 › 本人X」と、企画の本人のX投稿タスクの自動チェックに入る（Edge Function x-cast-posts）。

interface ReadStatus {
  enabled: boolean;
  interval_minutes: number;
  last_run_at: string | null;
  last_ok_at: string | null;
  last_error: string | null;
  blocked_until: string | null;
  last_read_count: number | null;
}

interface AccountRow {
  cast_id: string;
  username: string;
  x_user_id: string | null;
  last_checked_at: string | null;
  last_error: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const untyped = (table: string) => (supabase.from as any)(table);

const time = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

export function CastXReadStatus({ hasTenchoKeys }: { hasTenchoKeys: boolean }) {
  const { storeId } = useAdminStore();
  const [status, setStatus] = useState<ReadStatus | null>(null);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [postCount, setPostCount] = useState(0);
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    if (!storeId) return;
    const monthStart = new Date(`${new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 7)}-01T00:00:00+09:00`).toISOString();
    const [statusRes, accountsRes, postsRes] = await Promise.all([
      untyped("cast_x_read_status").select("*").eq("store_id", storeId).maybeSingle(),
      untyped("cast_x_accounts").select("cast_id,username,x_user_id,last_checked_at,last_error").eq("store_id", storeId),
      untyped("cast_x_posts").select("id", { count: "exact", head: true }).eq("store_id", storeId).gte("posted_at", monthStart),
    ]);
    setStatus((statusRes.data ?? null) as ReadStatus | null);
    setAccounts((accountsRes.data ?? []) as AccountRow[]);
    setPostCount(postsRes.count ?? 0);
  }, [storeId]);

  useEffect(() => {
    void load();
  }, [load]);

  const runNow = async () => {
    if (!storeId || running) return;
    setRunning(true);
    const { data, error } = await supabase.functions.invoke("x-cast-posts", { body: { action: "run", store_id: storeId } });
    setRunning(false);
    if (error || data?.error) toast.error(`読み取れませんでした：${data?.error ?? error?.message}`);
    else toast.success(`${data?.read ?? 0}件の投稿を読みました`);
    void load();
  };

  const setInterval = async (minutes: number) => {
    if (!storeId) return;
    const { error } = await supabase.rpc("set_cast_x_read_settings" as never, { p_store_id: storeId, p_enabled: true, p_interval_minutes: minutes } as never);
    if (error) toast.error(error.message);
    void load();
  };

  const linked = accounts.filter((a) => a.x_user_id).length;
  const missing = accounts.filter((a) => !a.x_user_id);
  const blocked = status?.blocked_until && new Date(status.blocked_until) > new Date();

  return (
    <div className="rounded-xl border bg-card p-4 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-bold">本人のXの読み取り（露出ノルマの「本人X」）</p>
        {!hasTenchoKeys ? (
          <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">店長アカウントのキー待ち</Badge>
        ) : blocked ? (
          <Badge variant="outline" className="border-rose-300 bg-rose-50 text-rose-700">止まっています</Badge>
        ) : (
          <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-700">動いています</Badge>
        )}
        <Button size="sm" variant="outline" className="ml-auto" onClick={runNow} disabled={!hasTenchoKeys || running}>
          {running ? <Loader2 size={14} className="mr-1 animate-spin" /> : <RefreshCw size={14} className="mr-1" />}
          今すぐ読む
        </Button>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        上の「X・店長」に4つのキーを入れると、セラピストのXアカウント（各セラピストのXの欄）の投稿を
        {status?.interval_minutes ? `${status.interval_minutes / 60}時間` : "3時間"}ごとに読みます（リポスト・返信は数えません）。
        読んだ投稿は露出ノルマの「本人X」と、企画の本人のX投稿の✓に自動で入ります。
      </p>
      {hasTenchoKeys && (
        <div className="mt-3 grid gap-1 text-xs sm:grid-cols-2">
          <p>最後に読んだ：{time(status?.last_ok_at ?? null)}{status?.last_read_count != null ? `（${status.last_read_count}件）` : ""}</p>
          <p>今月読んだ投稿：{postCount}件</p>
          <p>つながったアカウント：{linked}人{missing.length > 0 ? `／見つからない ${missing.length}人（${missing.map((a) => `@${a.username}`).join("、")}）` : ""}</p>
          <p className="flex items-center gap-1">
            読む間隔：
            {[60, 180, 360].map((minutes) => (
              <button
                key={minutes}
                type="button"
                onClick={() => void setInterval(minutes)}
                className={`rounded border px-1.5 py-0.5 ${status?.interval_minutes === minutes || (!status && minutes === 180) ? "border-primary bg-primary/10 font-semibold" : ""}`}
              >
                {minutes / 60}時間
              </button>
            ))}
          </p>
        </div>
      )}
      {status?.last_error && (
        <p className="mt-2 rounded bg-rose-50 px-2 py-1.5 text-xs text-rose-700">
          {status.last_error}
          {blocked ? `（${time(status.blocked_until)} まで読み直しません。キーを入れ直すか「今すぐ読む」で試せます）` : ""}
        </p>
      )}
    </div>
  );
}
