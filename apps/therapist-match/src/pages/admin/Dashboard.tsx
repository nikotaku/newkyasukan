import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { AdminLayout } from "@/components/AdminLayout";
import { Pill } from "@/components/ui/chip";
import { Select } from "@/components/ui/input";
import { COACHES } from "@/data/seed";
import { useApp } from "@/hooks/useApp";
import { percent, toDateKey, yen } from "@/lib/format";
import { daysSince, isCoaching, STAGE_TONE } from "@/lib/stage";
import { PLANS, STAGES, type Therapist } from "@/lib/types";

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="tabular mt-1 text-2xl font-bold">{value}</p>
      {note && <p className="mt-0.5 text-[11px] text-muted-foreground">{note}</p>}
    </div>
  );
}

interface Todo {
  therapist: Therapist;
  text: string;
  urgent: boolean;
}

function buildTodos(therapists: Therapist[]): Todo[] {
  const todos: Todo[] = [];
  for (const t of therapists) {
    const age = daysSince(t.createdAt);
    if (!t.coachId && t.stage === "新規登録") {
      todos.push({ therapist: t, text: `コーチ未定（登録から${age}日）`, urgent: age >= 1 });
    } else if (t.stage === "面談予約") {
      todos.push({ therapist: t, text: "初回面談を実施する", urgent: false });
    } else if (t.stage === "体験入店") {
      todos.push({ therapist: t, text: "体験入店の翌日の振り返り", urgent: false });
    }
  }
  return todos.sort((a, b) => Number(b.urgent) - Number(a.urgent));
}

export default function AdminDashboard() {
  const { therapists, stores, setCoach } = useApp();

  const thisMonth = toDateKey(new Date()).slice(0, 7);
  const newThisMonth = therapists.filter((t) => t.createdAt.startsWith(thisMonth)).length;
  const working = therapists.filter((t) => t.stage === "在籍" || t.stage === "定着").length;
  const settled = therapists.filter((t) => t.stage === "定着").length;
  const left = therapists.filter((t) => t.stage === "離脱").length;
  const retention = settled + left > 0 ? settled / (settled + left) : 0;
  const listed = stores.filter((s) => s.status === "掲載中");
  const monthlyRevenue = listed.reduce((sum, s) => sum + PLANS[s.plan].fee, 0);

  const counts = STAGES.map((stage) => ({ stage, count: therapists.filter((t) => t.stage === stage).length }));
  const maxCount = Math.max(1, ...counts.map((c) => c.count));
  const todos = buildTodos(therapists);

  return (
    <AdminLayout title="ダッシュボード" description="登録から定着までの流れと、今日やることをまとめています。数字はサンプルデータから出しています。">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="今月の新規登録" value={`${newThisMonth}人`} />
        <Tile label="在籍中（定着含む）" value={`${working}人`} />
        <Tile label="定着率" value={percent(retention)} note="定着 ÷（定着＋離脱）" />
        <Tile label="今月の掲載料" value={yen(monthlyRevenue)} note={`掲載中 ${listed.length}店舗`} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <section className="rounded-xl border bg-card p-4">
          <h2 className="text-sm font-bold">今日やること</h2>
          {todos.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">対応が必要な登録者はいません。</p>
          ) : (
            <ul className="mt-2 flex flex-col divide-y">
              {todos.map(({ therapist: t, text, urgent }) => (
                <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold">
                      {t.nickname}
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        {t.age}歳・{t.area}・{t.experience}
                      </span>
                    </p>
                    <p className={`mt-0.5 flex items-center gap-1 text-xs ${urgent ? "font-bold text-warn" : "text-muted-foreground"}`}>
                      {urgent && <AlertTriangle size={13} />}
                      {text}
                    </p>
                  </div>
                  {!t.coachId ? (
                    <Select
                      id={`assign-${t.id}`}
                      aria-label={`${t.nickname}さんの担当コーチ`}
                      className="h-9 w-40 md:h-9"
                      value=""
                      onChange={(e) => setCoach(t.id, e.target.value || null)}
                    >
                      <option value="">コーチを決める</option>
                      {COACHES.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <Pill tone={STAGE_TONE[t.stage]}>{t.stage}</Pill>
                  )}
                </li>
              ))}
            </ul>
          )}
          <Link to="/admin/therapists" className="mt-2 inline-flex items-center gap-1 text-sm text-primary hover:underline">
            登録者の一覧 <ArrowRight size={15} />
          </Link>
        </section>

        <div className="flex flex-col gap-6">
          <section className="rounded-xl border bg-card p-4">
            <h2 className="text-sm font-bold">いまの段階ごとの人数</h2>
            <ul className="mt-3 flex flex-col gap-2">
              {counts.map(({ stage, count }) => (
                <li key={stage} className="grid grid-cols-[4.5rem_1fr_2rem] items-center gap-2 text-sm">
                  <span className="text-xs text-muted-foreground">{stage}</span>
                  <div className="h-3 overflow-hidden rounded-r bg-muted/60" title={`${stage} ${count}人`}>
                    <div className="h-full rounded-r bg-[var(--series-1)]" style={{ width: `${(count / maxCount) * 100}%` }} />
                  </div>
                  <span className="tabular text-right text-xs font-bold">{count}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-xl border bg-card p-4">
            <h2 className="text-sm font-bold">コーチの担当人数</h2>
            <ul className="mt-3 flex flex-col gap-3">
              {COACHES.map((coach) => {
                const load = therapists.filter((t) => t.coachId === coach.id && isCoaching(t.stage)).length;
                return (
                  <li key={coach.id}>
                    <div className="flex items-baseline justify-between text-sm">
                      <span className="font-bold">{coach.name}</span>
                      <span className="tabular text-xs text-muted-foreground">
                        {load} / {coach.capacity}人
                      </span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, (load / coach.capacity) * 100)}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
              1人のコーチが同時に見られる人数がこの事業の上限を決めます。収支シミュレーターの「担当上限」と同じ数字です。
            </p>
          </section>
        </div>
      </div>
    </AdminLayout>
  );
}
