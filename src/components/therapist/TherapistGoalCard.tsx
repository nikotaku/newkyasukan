// セラピストのマイページ：お店と決めた自分のゴール（教育の「ゴール」タブで設定）と、今月の実績・達成率。
// ゴールがまだ決まっていない人には何も出さない。RPC get_therapist_goal（本人のトークン）。
import { useEffect, useState } from "react";
import { Flag, Target } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { achievement } from "@/lib/castGoals";
import { cn } from "@/lib/utils";

interface GoalResult {
  month: string;
  goal: {
    goal_text: string | null;
    monthly_sales_target: number | null;
    monthly_count_target: number | null;
    honshimei_rate_target: number | null;
  } | null;
  sales: number;
  count: number;
  honshimei: number;
  planned_count: number;
  planned_sales: number;
}

const yen = (n: number) => `¥${Math.round(n).toLocaleString("ja-JP")}`;

function Row({ label, actual, target, fmt, note }: {
  label: string;
  actual: number | null;
  target: number | null;
  fmt: (n: number) => string;
  note?: string | null;
}) {
  if (target == null) return null;
  const pct = achievement(actual, target);
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums">
          <span className="text-sm font-bold">{actual == null ? "—" : fmt(actual)}</span>
          <span className="text-muted-foreground"> / 目標 {fmt(target)}</span>
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full", pct == null ? "" : pct >= 100 ? "bg-emerald-500" : "bg-primary")}
          style={{ width: `${Math.min(100, pct ?? 0)}%` }} />
      </div>
      <div className="flex justify-between text-[11px] text-muted-foreground">
        <span>{note ?? ""}</span>
        <span className={cn(pct != null && pct >= 100 && "font-semibold text-emerald-600")}>
          {pct == null ? "" : pct >= 100 ? `達成 ${pct}%` : `${pct}%`}
        </span>
      </div>
    </div>
  );
}

export function TherapistGoalCard({ token }: { token: string }) {
  const [data, setData] = useState<GoalResult | null>(null);

  useEffect(() => {
    void supabase.rpc("get_therapist_goal" as never, { p_token: token } as never).then(({ data: result, error }) => {
      if (error) { console.error("ゴールを読めませんでした", error); return; }
      setData((result as unknown as GoalResult) ?? null);
    });
  }, [token]);

  const goal = data?.goal;
  if (!data || !goal) return null;
  const hasNumbers = goal.monthly_sales_target != null || goal.monthly_count_target != null || goal.honshimei_rate_target != null;
  if (!goal.goal_text && !hasNumbers) return null;

  const month = Number(data.month.slice(5, 7));
  const rate = data.count > 0 ? Math.round((data.honshimei / data.count) * 1000) / 10 : null;

  return (
    <div className="rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 to-transparent p-4 shadow-sm">
      <p className="mb-2 flex items-center gap-1.5 text-sm font-bold"><Target size={16} className="text-primary" />わたしのゴール</p>
      {goal.goal_text && (
        <div className="mb-3 rounded-xl bg-background/80 px-3 py-2">
          <p className="mb-0.5 flex items-center gap-1 text-[11px] font-semibold text-muted-foreground"><Flag size={12} />めざす姿</p>
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{goal.goal_text}</p>
        </div>
      )}
      {hasNumbers && (
        <div className="space-y-2.5">
          <p className="text-xs font-semibold text-muted-foreground">{month}月の目標と今の実績（施術済み）</p>
          <Row label="売上" actual={data.sales} target={goal.monthly_sales_target} fmt={yen}
            note={data.planned_sales ? `予約の予定 +${yen(data.planned_sales)}` : null} />
          <Row label="本数" actual={data.count} target={goal.monthly_count_target} fmt={(n) => `${n}本`}
            note={data.planned_count ? `予約の予定 +${data.planned_count}本` : null} />
          <Row label="本指名率" actual={rate} target={goal.honshimei_rate_target} fmt={(n) => `${n}%`}
            note={data.count ? `本指名 ${data.honshimei}/${data.count}本（姫予約を含む）` : null} />
        </div>
      )}
    </div>
  );
}
