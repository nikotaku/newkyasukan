import { Link } from "react-router-dom";
import { Check, MessageCircle } from "lucide-react";
import { PublicLayout } from "@/components/PublicLayout";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/chip";
import { COACHES, LESSONS } from "@/data/seed";
import { useApp } from "@/hooks/useApp";
import { WEEKS_PER_MONTH } from "@/lib/earnings";
import { shortDate, yen } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ApplicationStatus, Pace, Therapist } from "@/lib/types";

const FLOW: ApplicationStatus[] = ["応募済", "面接調整中", "体験入店", "在籍"];
const DAYS_BY_PACE: Record<Pace, number> = { "週1〜2日": 1.5, "週3〜4日": 3.5, "週5日以上": 5 };

function nextAction(me: Therapist) {
  if (!me.coachId) return "担当コーチを決めています。24時間以内に登録した連絡先へ連絡します。";
  if (me.applications.length === 0) return "コーチとの面談のあと、気になるお店に応募してみましょう。";
  if (me.applications.some((a) => a.status === "体験入店")) return "体験入店の翌日に、コーチと15分の振り返りをします。";
  if (me.applications.some((a) => a.status === "在籍")) return "写メ日記の最初の5本をコーチに送って添削してもらいましょう。";
  return "面接の日程をコーチと調整しています。";
}

function NotRegistered() {
  const { enterDemoAccount } = useApp();
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-16 text-center">
      <h1 className="font-display text-2xl font-extrabold">マイページ</h1>
      <p className="text-sm leading-relaxed text-muted-foreground">
        登録すると、担当コーチ・応募したお店の進み具合・レッスンがここにまとまります。
      </p>
      <Button asChild size="lg" className="w-full">
        <Link to="/register">1分で無料登録</Link>
      </Button>
      <Button variant="outline" size="lg" className="w-full" onClick={enterDemoAccount}>
        サンプルの登録者（ゆいさん）で見る
      </Button>
    </div>
  );
}

export default function MyPage() {
  const { me, stores, toggleLesson, signOut } = useApp();
  if (!me) {
    return (
      <PublicLayout>
        <NotRegistered />
      </PublicLayout>
    );
  }

  const coach = COACHES.find((c) => c.id === me.coachId) ?? null;
  const done = LESSONS.filter((l) => me.lessonsDone.includes(l.id)).length;
  const back = stores.find((s) => s.id === me.applications[0]?.storeId)?.back60 ?? 8000;
  const perDay = me.goal / (DAYS_BY_PACE[me.pace] * WEEKS_PER_MONTH * back);

  return (
    <PublicLayout>
      <div className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-8">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="eyebrow">マイページ</p>
            <h1 className="mt-1 font-display text-2xl font-extrabold">{me.nickname}さん</h1>
          </div>
          <Pill tone="primary">{me.stage}</Pill>
        </div>

        <section className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary font-display text-lg font-extrabold text-primary-foreground">
              {coach ? coach.name.slice(0, 1) : "？"}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-bold">{coach ? `担当コーチ ${coach.name}` : "担当コーチを決めています"}</p>
              <p className="text-xs text-muted-foreground">{coach?.profile ?? "登録から24時間以内に決まります"}</p>
            </div>
          </div>
          <div className="mt-3 rounded-lg bg-accent/60 p-3 text-sm">
            <p className="text-[11px] font-bold text-accent-foreground">次にやること</p>
            <p className="mt-0.5 leading-relaxed">{nextAction(me)}</p>
          </div>
          <Button variant="outline" className="mt-3 w-full" disabled={!coach}>
            <MessageCircle /> コーチに{me.contactType}で相談する
          </Button>
        </section>

        <section className="rounded-xl border bg-card p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-bold">応募したお店</h2>
            <Link to="/stores" className="text-sm text-primary underline-offset-4 hover:underline">
              お店を探す
            </Link>
          </div>
          {me.applications.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">まだ応募していません。</p>
          ) : (
            <ul className="mt-3 flex flex-col divide-y">
              {me.applications.map((app) => {
                const store = stores.find((s) => s.id === app.storeId);
                const reached = FLOW.indexOf(app.status);
                return (
                  <li key={app.storeId} className="py-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <Link to={`/stores/${app.storeId}`} className="font-bold hover:underline">
                        {store?.name ?? "掲載終了したお店"}
                      </Link>
                      <span className="tabular text-xs text-muted-foreground">{shortDate(app.updatedAt)} 更新</span>
                    </div>
                    {app.status === "見送り" ? (
                      <p className="mt-2 text-sm text-muted-foreground">今回は見送りになりました。コーチと次のお店を探しましょう。</p>
                    ) : (
                      <ol className="mt-2 grid grid-cols-4 gap-1">
                        {FLOW.map((step, i) => (
                          <li key={step} className="flex flex-col gap-1">
                            <div className={cn("h-1.5 rounded-full", i <= reached ? "bg-primary" : "bg-muted")} />
                            <span className={cn("text-[11px]", i === reached ? "font-bold" : "text-muted-foreground")}>{step}</span>
                          </li>
                        ))}
                      </ol>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="rounded-xl border bg-card p-4">
          <h2 className="font-bold">目標の月収</h2>
          <p className="tabular mt-1 font-display text-3xl font-extrabold text-gold">{yen(me.goal)}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {me.pace}（60分の取り分 {yen(back)}）なら、1日あたり
            <span className="tabular font-bold text-foreground"> {perDay.toFixed(1)}本 </span>
            が目安です。
          </p>
        </section>

        <section className="rounded-xl border bg-card p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-bold">レッスン</h2>
            <span className="tabular text-sm text-muted-foreground">
              {done} / {LESSONS.length}
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${(done / LESSONS.length) * 100}%` }} />
          </div>
          <ul className="mt-3 flex flex-col divide-y">
            {LESSONS.map((lesson) => {
              const isDone = me.lessonsDone.includes(lesson.id);
              return (
                <li key={lesson.id}>
                  <button type="button" onClick={() => toggleLesson(lesson.id)} className="flex w-full items-start gap-3 py-3 text-left" aria-pressed={isDone}>
                    <span
                      className={cn(
                        "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                        isDone ? "border-primary bg-primary text-primary-foreground" : "border-input",
                      )}
                    >
                      {isDone && <Check size={13} strokeWidth={3} />}
                    </span>
                    <span className="min-w-0">
                      <span className="text-[11px] font-bold text-primary">{lesson.week}</span>
                      <span className={cn("block text-sm font-bold", isDone && "text-muted-foreground line-through decoration-1")}>{lesson.title}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            {me.area}・{me.age}歳・{me.experience}・{me.contactType}で連絡
          </span>
          <button type="button" onClick={signOut} className="underline">
            この画面から出る（試作版の切り替え）
          </button>
        </div>
      </div>
    </PublicLayout>
  );
}
