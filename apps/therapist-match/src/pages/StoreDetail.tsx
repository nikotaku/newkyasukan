import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Check, Clock, MapPin } from "lucide-react";
import { PublicLayout } from "@/components/PublicLayout";
import { CoachNote, SlotPill, StoreFigures } from "@/components/StoreCard";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/chip";
import { useApp } from "@/hooks/useApp";
import { useApplyToStore } from "@/hooks/useApplyToStore";
import { monthlyEarnings } from "@/lib/earnings";
import { yen } from "@/lib/format";

// 掲載前にコーチが取材で確かめる項目（どのお店も同じ）
const CHECKED = [
  "60分の取り分・保証の条件を書面で確認",
  "性的なサービスを求めていないこと",
  "18歳未満・高校生を採用しないこと、身分証の確認手順",
  "待機場所・送迎・寮の実物",
  "罰金・ノルマの有無",
];

export default function StoreDetail() {
  const { id } = useParams();
  const { stores, me } = useApp();
  const apply = useApplyToStore();
  const store = stores.find((s) => s.id === id);

  if (!store) {
    return (
      <PublicLayout>
        <div className="mx-auto max-w-2xl px-4 py-16 text-center">
          <p>お店が見つかりませんでした。</p>
          <Button asChild variant="outline" className="mt-4">
            <Link to="/stores">お店の一覧へ</Link>
          </Button>
        </div>
      </PublicLayout>
    );
  }

  const applied = me?.applications.some((a) => a.storeId === store.id) ?? false;
  const example = monthlyEarnings({ daysPerWeek: 3, sessionsPerDay: 3, backPer60: store.back60, nominationRate: 0.3, nominationFee: 2000 });

  return (
    <PublicLayout>
      <div className="mx-auto max-w-3xl px-4 py-6">
        <Link to="/stores" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft size={16} /> お店の一覧
        </Link>

        <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-extrabold sm:text-3xl">{store.name}</h1>
            <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <MapPin size={15} /> {store.area}・{store.station}
              </span>
              <span className="inline-flex items-center gap-1">
                <Clock size={15} /> {store.hours}
              </span>
            </p>
          </div>
          <SlotPill slots={store.slots} />
        </div>

        <p className="mt-4 leading-relaxed">{store.description}</p>

        <div className="mt-5">
          <StoreFigures store={store} />
        </div>

        <ul className="mt-4 flex flex-wrap gap-1.5">
          {store.tags.map((tag) => (
            <li key={tag}>
              <Pill>{tag}</Pill>
            </li>
          ))}
        </ul>

        <div className="mt-5">
          <CoachNote note={store.coachNote} />
        </div>

        <section className="mt-8 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border bg-card p-4">
            <h2 className="text-sm font-bold">このお店で週3日働いた場合</h2>
            <p className="tabular mt-2 font-display text-3xl font-extrabold text-gold">{yen(example.total)}</p>
            <p className="tabular mt-1 text-xs text-muted-foreground">
              1日3本 × 週3日 × {yen(store.back60)}、指名3割（+2,000円）で計算した目安
            </p>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <h2 className="text-sm font-bold">コーチが取材で確認したこと</h2>
            <ul className="mt-2 flex flex-col gap-1.5 text-sm">
              {CHECKED.map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <Check size={16} className="mt-0.5 shrink-0 text-good" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <div className="sticky bottom-[calc(64px+env(safe-area-inset-bottom,0px))] mt-8 flex gap-2 rounded-xl border bg-card/95 p-3 backdrop-blur md:bottom-4">
          <Button asChild variant="outline" size="lg" className="flex-1">
            <Link to="/me">コーチに相談する</Link>
          </Button>
          {applied ? (
            <Button size="lg" variant="secondary" className="flex-1" disabled>
              <Check /> 応募済み
            </Button>
          ) : (
            <Button size="lg" className="flex-1" disabled={store.slots <= 0} onClick={() => apply(store.id)}>
              このお店に応募
            </Button>
          )}
        </div>
      </div>
    </PublicLayout>
  );
}
