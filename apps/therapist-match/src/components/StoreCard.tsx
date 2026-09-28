import { Link } from "react-router-dom";
import { Check, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/chip";
import { yen } from "@/lib/format";
import type { Store } from "@/lib/types";

export function SlotPill({ slots }: { slots: number }) {
  if (slots <= 0) return <Pill>今月の受け入れ終了</Pill>;
  return <Pill tone="good">受け入れ枠 残り{slots}名</Pill>;
}

export function StoreFigures({ store }: { store: Store }) {
  const figures = [
    { label: "60分の取り分", value: yen(store.back60) },
    { label: "日給保証", value: store.guarantee ? yen(store.guarantee) : "なし" },
    { label: "平均日給", value: yen(store.avgDaily) },
  ];
  return (
    <dl className="grid grid-cols-3 divide-x rounded-lg border bg-background">
      {figures.map((f) => (
        <div key={f.label} className="px-2 py-2.5 text-center">
          <dt className="text-[11px] text-muted-foreground">{f.label}</dt>
          <dd className="tabular mt-0.5 text-[15px] font-bold text-gold">{f.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function CoachNote({ note }: { note: string }) {
  return (
    <div className="flex gap-3 rounded-lg bg-accent/60 p-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
        コ
      </span>
      <div>
        <p className="text-[11px] font-bold text-accent-foreground">取材したコーチから</p>
        <p className="mt-0.5 text-sm leading-relaxed">{note}</p>
      </div>
    </div>
  );
}

export function StoreCard({ store, applied, onApply }: { store: Store; applied: boolean; onApply: () => void }) {
  return (
    <article className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-bold leading-snug">
            <Link to={`/stores/${store.id}`} className="hover:underline">
              {store.name}
            </Link>
          </h3>
          <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin size={13} /> {store.area}・{store.station}
          </p>
        </div>
        <SlotPill slots={store.slots} />
      </div>

      <StoreFigures store={store} />

      <ul className="flex flex-wrap gap-1.5">
        {store.tags.map((tag) => (
          <li key={tag}>
            <Pill>{tag}</Pill>
          </li>
        ))}
      </ul>

      <CoachNote note={store.coachNote} />

      <div className="mt-auto grid grid-cols-2 gap-2">
        <Button asChild variant="outline">
          <Link to={`/stores/${store.id}`}>くわしく見る</Link>
        </Button>
        {applied ? (
          <Button variant="secondary" disabled>
            <Check /> 応募済み
          </Button>
        ) : (
          <Button onClick={onApply} disabled={store.slots <= 0}>
            このお店に応募
          </Button>
        )}
      </div>
    </article>
  );
}
