import { useCallback, useEffect, useMemo, useState } from "react";
import { addMonths, format, startOfMonth } from "date-fns";
import { ChevronLeft, ChevronRight, Flag, Loader2, Pencil, Target } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAdminStore } from "@/hooks/useAdminStore";
import { supabase } from "@/integrations/supabase/client";
import { castAdminLabel } from "@/lib/castProfileCompletion";
import { driveImgUrl } from "@/lib/drive";
import {
  AUDIENCE_LABEL,
  achievement,
  goalAudience,
  isGoalTarget,
  monthActual,
  parseGoalNumber,
  shiftMonthCounts,
  type CastGoal,
  type GoalAudience,
  type GoalReservation,
} from "@/lib/castGoals";
import { cn } from "@/lib/utils";

// 教育の「ゴール」タブ：在籍・出稼ぎのリピートのセラピストごとに、最終的なゴール（文章）と
// 1か月の売上・本数・本指名率の目標を決め、その月の実績（施術済み）と比べる。

const db = supabase as unknown as { from: (table: string) => any };
const yen = (n: number) => `¥${Math.round(n).toLocaleString("ja-JP")}`;

interface CastRow {
  id: string;
  name: string;
  real_name: string | null;
  tags: string[] | null;
  photo: string | null;
}

// 営業日（朝6時切り替え）の今月
const businessNow = () => {
  const now = new Date();
  return now.getHours() < 6 ? new Date(now.getTime() - 6 * 3600 * 1000) : now;
};

function Meter({ label, actual, target, format: fmt, planned }: {
  label: string;
  actual: number | null;
  target: number | null;
  format: (n: number) => string;
  planned?: string | null;
}) {
  const pct = achievement(actual, target);
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums">
          <span className="text-sm font-bold">{actual == null ? "—" : fmt(actual)}</span>
          <span className="text-muted-foreground"> / {target == null ? "目標なし" : fmt(target)}</span>
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full", pct == null ? "bg-transparent" : pct >= 100 ? "bg-emerald-500" : pct >= 60 ? "bg-amber-400" : "bg-rose-400")}
          style={{ width: `${Math.min(100, pct ?? 0)}%` }} />
      </div>
      <div className="flex justify-between text-[11px] text-muted-foreground">
        <span>{planned ?? ""}</span>
        <span className={cn(pct != null && pct >= 100 && "font-semibold text-emerald-600")}>{pct == null ? "" : `${pct}%`}</span>
      </div>
    </div>
  );
}

export function CastGoalsBoard() {
  const { storeId, loading: storeLoading } = useAdminStore();
  const [month, setMonth] = useState(() => format(businessNow(), "yyyy-MM"));
  const [casts, setCasts] = useState<CastRow[]>([]);
  const [shiftMonths, setShiftMonths] = useState<Map<string, number>>(new Map());
  const [goals, setGoals] = useState<Map<string, CastGoal>>(new Map());
  const [reservations, setReservations] = useState<GoalReservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [editing, setEditing] = useState<CastRow | null>(null);
  const [form, setForm] = useState({ goal_text: "", sales: "", count: "", rate: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (storeLoading || !storeId) return;
    setLoading(true);
    const [castRes, shiftRes, goalRes] = await Promise.all([
      db.from("casts").select("id, name, real_name, tags, photo").eq("store_id", storeId).eq("is_active", true).order("name"),
      db.from("shifts").select("cast_id, shift_date").eq("store_id", storeId).not("status", "in", "(cancelled,rejected)").limit(5000),
      db.from("cast_goals").select("cast_id, goal_text, monthly_sales_target, monthly_count_target, honshimei_rate_target, updated_at").eq("store_id", storeId),
    ]);
    if (castRes.error || goalRes.error) toast.error("ゴールを読み込めませんでした");
    setCasts(castRes.data ?? []);
    setShiftMonths(shiftMonthCounts(shiftRes.data ?? []));
    setGoals(new Map(((goalRes.data ?? []) as CastGoal[]).map((g) => [g.cast_id, g])));
    setLoading(false);
  }, [storeId, storeLoading]);

  useEffect(() => { void load(); }, [load]);

  // その月の予約（営業日で見るので翌月1日の朝まで読む）
  useEffect(() => {
    if (storeLoading || !storeId) return;
    const start = startOfMonth(new Date(`${month}-01T00:00:00`));
    const from = format(start, "yyyy-MM-dd");
    const to = format(addMonths(start, 1), "yyyy-MM-dd");
    void db.from("reservations")
      .select("cast_id, reservation_date, start_time, status, price, nomination_type")
      .eq("store_id", storeId).gte("reservation_date", from).lte("reservation_date", to)
      .in("status", ["completed", "confirmed"]).limit(5000)
      .then(({ data, error }: { data: GoalReservation[] | null; error: unknown }) => {
        if (error) toast.error("予約を読み込めませんでした");
        setReservations(data ?? []);
      });
  }, [month, storeId, storeLoading]);

  const rows = useMemo(() => casts.map((cast) => {
    const audience: GoalAudience = goalAudience(cast.tags, shiftMonths.get(cast.id) ?? 0);
    return { cast, audience, goal: goals.get(cast.id) ?? null, actual: monthActual(reservations, cast.id, month) };
  }).filter((row) => showAll || isGoalTarget(row.audience) || row.goal)
    .sort((a, b) => Number(!a.goal) - Number(!b.goal) || (b.actual.sales - a.actual.sales)), [casts, goals, month, reservations, shiftMonths, showAll]);

  const unset = rows.filter((row) => isGoalTarget(row.audience) && !row.goal).length;

  const openEdit = (cast: CastRow) => {
    const goal = goals.get(cast.id);
    setForm({
      goal_text: goal?.goal_text ?? "",
      sales: goal?.monthly_sales_target != null ? String(goal.monthly_sales_target) : "",
      count: goal?.monthly_count_target != null ? String(goal.monthly_count_target) : "",
      rate: goal?.honshimei_rate_target != null ? String(goal.honshimei_rate_target) : "",
    });
    setEditing(cast);
  };

  const save = async () => {
    if (!editing) return;
    const goalText = form.goal_text.trim();
    if (goalText.length > 2000) { toast.error("ゴールの文章は2000文字までです"); return; }
    setSaving(true);
    const { data: auth } = await supabase.auth.getUser();
    const row = {
      store_id: storeId,
      cast_id: editing.id,
      goal_text: goalText || null,
      monthly_sales_target: parseGoalNumber(form.sales, { max: 100000000 }),
      monthly_count_target: parseGoalNumber(form.count, { max: 1000 }),
      honshimei_rate_target: parseGoalNumber(form.rate, { max: 100, decimals: 1 }),
      updated_by: auth.user?.id ?? null,
      updated_at: new Date().toISOString(),
    };
    const { error } = await db.from("cast_goals").upsert(row, { onConflict: "cast_id" });
    setSaving(false);
    if (error) { console.error(error); toast.error("保存できませんでした"); return; }
    setGoals((current) => new Map(current).set(editing.id, row));
    toast.success(`${castAdminLabel(editing)}さんのゴールを保存しました`);
    setEditing(null);
  };

  const monthLabel = format(new Date(`${month}-01T00:00:00`), "yyyy年M月");
  const shiftMonth = (delta: number) => setMonth(format(addMonths(new Date(`${month}-01T00:00:00`), delta), "yyyy-MM"));
  const isCurrentMonth = month === format(businessNow(), "yyyy-MM");

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            <div>
              <p className="font-semibold">セラピストのゴール</p>
              <p className="text-xs text-muted-foreground">最終的なゴール（文章）と、1か月の売上・本数・本指名率の目標。実績はその月の施術済みの予約から数えます（本指名は姫予約を含む）。</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" onClick={() => shiftMonth(-1)} aria-label="前の月"><ChevronLeft size={16} /></Button>
            <span className="min-w-24 text-center text-sm font-semibold tabular-nums">{monthLabel}</span>
            <Button variant="outline" size="icon" onClick={() => shiftMonth(1)} disabled={isCurrentMonth} aria-label="次の月"><ChevronRight size={16} /></Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Button size="sm" variant={showAll ? "outline" : "default"} onClick={() => setShowAll(false)}>在籍・出稼ぎリピート</Button>
        <Button size="sm" variant={showAll ? "default" : "outline"} onClick={() => setShowAll(true)}>在籍中の全員</Button>
        {unset > 0 && <span className="text-xs font-medium text-rose-600">ゴール未設定 {unset}人</span>}
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="animate-spin text-muted-foreground" /></div>
      ) : rows.length === 0 ? (
        <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">対象のセラピストがいません</CardContent></Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {rows.map(({ cast, audience, goal, actual }) => (
            <Card key={cast.id} className={cn(!goal && isGoalTarget(audience) && "border-dashed")}>
              <CardContent className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    {cast.photo ? <img src={driveImgUrl(cast.photo)} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
                      : <div className="h-10 w-10 shrink-0 rounded-full bg-muted" />}
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{castAdminLabel(cast)}</p>
                      <Badge variant="outline" className="text-[10px]">{AUDIENCE_LABEL[audience]}</Badge>
                    </div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => openEdit(cast)}>
                    <Pencil size={14} className="mr-1" />{goal ? "編集" : "ゴールを決める"}
                  </Button>
                </div>

                <div className="rounded-md bg-muted/50 px-3 py-2">
                  <p className="mb-0.5 flex items-center gap-1 text-[11px] font-semibold text-muted-foreground"><Flag size={12} />最終的なゴール</p>
                  <p className={cn("whitespace-pre-wrap text-sm", !goal?.goal_text && "text-muted-foreground")}>
                    {goal?.goal_text || "まだ決めていません"}
                  </p>
                </div>

                <div className="space-y-2">
                  <Meter label={`${monthLabel}の売上`} actual={actual.sales} target={goal?.monthly_sales_target ?? null} format={yen}
                    planned={actual.plannedSales ? `予定 +${yen(actual.plannedSales)}` : null} />
                  <Meter label="本数" actual={actual.count} target={goal?.monthly_count_target ?? null} format={(n) => `${n}本`}
                    planned={actual.plannedCount ? `予定 +${actual.plannedCount}本` : null} />
                  <Meter label="本指名率" actual={actual.honshimeiRate} target={goal?.honshimei_rate_target ?? null} format={(n) => `${n}%`}
                    planned={actual.count ? `本指名 ${actual.honshimei}/${actual.count}本` : null} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(open) => { if (!open) setEditing(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? `${castAdminLabel(editing)}さんのゴール` : ""}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>最終的なゴール（文章）</Label>
              <Textarea rows={6} value={form.goal_text} maxLength={2000}
                onChange={(e) => setForm((f) => ({ ...f, goal_text: e.target.value }))}
                placeholder={"例）半年後に艶華の指名No.1。\n本指名のお客様を20人に増やし、月の売上100万円を安定して出せるセラピストになる。"} />
              <p className="text-right text-[11px] text-muted-foreground">{form.goal_text.length} / 2000文字</p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">1か月の売上</Label>
                <Input inputMode="numeric" value={form.sales} placeholder="1000000"
                  onChange={(e) => setForm((f) => ({ ...f, sales: e.target.value }))} />
                <p className="text-[11px] text-muted-foreground">円</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">必要な本数</Label>
                <Input inputMode="numeric" value={form.count} placeholder="40"
                  onChange={(e) => setForm((f) => ({ ...f, count: e.target.value }))} />
                <p className="text-[11px] text-muted-foreground">本 / 月</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">本指名率</Label>
                <Input inputMode="decimal" value={form.rate} placeholder="40"
                  onChange={(e) => setForm((f) => ({ ...f, rate: e.target.value }))} />
                <p className="text-[11px] text-muted-foreground">%</p>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">売上・本数・本指名率は空でも保存できます。実績は施術済みの予約から毎月数えます。</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>やめる</Button>
            <Button onClick={() => void save()} disabled={saving}>
              {saving && <Loader2 size={14} className="mr-1 animate-spin" />}保存する
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
