import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Clock3, Loader2, RefreshCw, UsersRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { promotionDate, promotionReportedAt } from "@/lib/therapistPromotion";
import {
  promotionParticipants, postingCompletionIndex, postingCompletionKey,
  therapistPostingProgress, type PostingCompletion,
} from "@/lib/promotionPostingStatus";

interface PostingGroup {
  key: string;
  date: string | null;
  label: string;
  tasks: Array<{ id: string; label: string }>;
}

export function TherapistPostingStatus({ storeId, planId, castIds, therapistLabel, groups }: {
  storeId: string;
  planId: string;
  castIds: string[];
  therapistLabel: string;
  groups: PostingGroup[];
}) {
  const { user } = useAuth();
  const taskIds = groups.flatMap((group) => group.tasks.map((task) => task.id)).sort();
  const { data, isPending, error, isFetching, refetch } = useQuery({
    queryKey: ["promotion-posting-status", storeId, user?.id, planId, castIds, therapistLabel, taskIds],
    enabled: Boolean(storeId && user && taskIds.length),
    queryFn: async () => {
      const castsQuery = supabase.from("casts").select("id, name").eq("store_id", storeId);
      const { data: casts, error: castError } = await (castIds.length
        ? castsQuery.in("id", castIds)
        : castsQuery.eq("is_active", true).in("name", [therapistLabel, ...therapistLabel.split(/\s*[&＆]\s*/)]));
      if (castError) throw castError;
      const participants = promotionParticipants(castIds, therapistLabel, casts ?? []);
      const rows: PostingCompletion[] = [];
      if (participants.length) {
        // Read every page for this plan; the notification RPC returns only 200 reports.
        for (let chunk = 0; chunk < taskIds.length; chunk += 100) {
          for (let offset = 0; ; offset += 500) {
            const { data: page, error: pageError } = await supabase
              .from("therapist_promotion_task_completions" as never)
              .select("cast_id, task_id, is_completed, completed_at")
              .eq("store_id", storeId)
              .in("cast_id", participants.map((cast) => cast.id))
              .in("task_id", taskIds.slice(chunk, chunk + 100))
              .order("id").range(offset, offset + 499);
            if (pageError) throw pageError;
            rows.push(...(page as unknown as PostingCompletion[] ?? []));
            if (!page || page.length < 500) break;
          }
        }
      }
      return { participants, rows };
    },
    staleTime: 10_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: "always",
  });
  const participants = data?.participants ?? [];
  const index = postingCompletionIndex(data?.rows ?? []);
  const participantIds = participants.map((cast) => cast.id);
  const progress = therapistPostingProgress(taskIds, participantIds, index);
  const ready = !isPending && !error && participants.length > 0;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-bold"><UsersRound size={18} className="shrink-0 text-primary" />セラピスト本人の投稿予定・完了状況</h3>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-muted-foreground">{ready ? `${progress.completed}/${progress.total} 完了（人分）` : `予定 ${taskIds.length}件`}</span>
          <Button type="button" variant="ghost" size="sm" aria-label="本人の投稿状況を更新" disabled={isFetching || !taskIds.length} onClick={() => void refetch()}>
            <RefreshCw size={14} className={isFetching ? "animate-spin" : ""} />
          </Button>
        </div>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">本人がポータルで報告した完了状況です。30秒ごとに更新します。未報告は投稿の有無を確認できていない状態です。</p>
      {taskIds.length > 0 && (isPending ? (
        <p role="status" className="mb-3 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 size={16} className="animate-spin" />投稿状況を読み込んでいます</p>
      ) : error ? (
        <p role="alert" className="mb-3 text-sm text-destructive">投稿状況を取得できませんでした。更新ボタンで再試行してください。</p>
      ) : !participants.length ? (
        <p className="mb-3 text-sm text-muted-foreground">対象セラピストが設定されていないため、完了状況を確認できません。</p>
      ) : null)}
      <div className="space-y-3">
        {groups.map((group) => {
          const groupProgress = therapistPostingProgress(group.tasks.map((task) => task.id), participantIds, index);
          const done = ready && groupProgress.completed === groupProgress.total;
          return (
            <div key={group.key} className="overflow-hidden rounded-xl border bg-background">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/35 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-primary">{promotionDate(group.date)}</span>
                  <span className="text-sm font-semibold">{group.label}</span>
                </div>
                <Badge variant="outline" className={done ? "border-emerald-200 bg-emerald-50 text-emerald-700" : ""}>{ready ? `${groupProgress.completed}/${groupProgress.total} 完了（人分）` : `本人投稿の予定 ${group.tasks.length}件`}</Badge>
              </div>
              <div className="grid gap-2 p-3 sm:grid-cols-2">
                {group.tasks.map((task) => (
                  <div key={task.id} className="min-w-0 rounded-lg border bg-card px-3 py-2.5 text-sm">
                    <div className="flex items-start gap-2">
                      <Badge variant="secondary" className="shrink-0 text-[10px]">本人投稿</Badge>
                      <span className="min-w-0 break-words font-medium">{task.label}</span>
                    </div>
                    {ready && <div className="mt-3 space-y-2 border-t pt-2">
                      {participants.map((cast) => {
                        const completion = index.get(postingCompletionKey(cast.id, task.id));
                        return <div key={cast.id} className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-xs">
                          <span className="min-w-0 break-words font-medium">{cast.name}</span>
                          <span className={`flex items-center gap-1 ${completion ? "text-emerald-700" : "text-muted-foreground"}`}>
                            {completion ? <CheckCircle2 size={14} /> : <Clock3 size={14} />}
                            {completion ? "投稿完了" : "未報告"}
                          </span>
                          {completion?.completed_at && <span className="w-full text-[11px] text-muted-foreground">報告 {promotionReportedAt(completion.completed_at)}</span>}
                        </div>;
                      })}
                    </div>}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      {!taskIds.length && <p className="text-sm text-muted-foreground">本人の投稿予定はありません。</p>}
    </div>
  );
}
