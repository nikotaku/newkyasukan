import { useMemo, useState } from "react";
import { PublicLayout } from "@/components/PublicLayout";
import { StoreCard } from "@/components/StoreCard";
import { ChoiceChip } from "@/components/ui/chip";
import { Select } from "@/components/ui/input";
import { useApp } from "@/hooks/useApp";
import { useApplyToStore } from "@/hooks/useApplyToStore";
import { AREAS, STORE_TAGS, type Area, type Store, type StoreTag } from "@/lib/types";

const PLAN_ORDER = { premium: 0, standard: 1, light: 2 } as const;

const SORTS = {
  recommended: { label: "おすすめ順", compare: (a: Store, b: Store) => Number(b.slots > 0) - Number(a.slots > 0) || PLAN_ORDER[a.plan] - PLAN_ORDER[b.plan] },
  back: { label: "60分の取り分が高い順", compare: (a: Store, b: Store) => b.back60 - a.back60 },
  daily: { label: "平均日給が高い順", compare: (a: Store, b: Store) => b.avgDaily - a.avgDaily },
} as const;
type SortKey = keyof typeof SORTS;

export default function Stores() {
  const { stores, me } = useApp();
  const apply = useApplyToStore();
  const [area, setArea] = useState<Area | "all">(me?.area ?? "all");
  const [tags, setTags] = useState<StoreTag[]>([]);
  const [openOnly, setOpenOnly] = useState(true);
  const [sort, setSort] = useState<SortKey>("recommended");

  const visible = useMemo(
    () =>
      stores
        .filter((s) => s.status === "掲載中")
        .filter((s) => area === "all" || s.area === area)
        .filter((s) => !openOnly || s.slots > 0)
        .filter((s) => tags.every((t) => s.tags.includes(t)))
        .sort(SORTS[sort].compare),
    [stores, area, openOnly, tags, sort],
  );

  const toggleTag = (tag: StoreTag) => setTags((current) => (current.includes(tag) ? current.filter((t) => t !== tag) : [...current, tag]));
  const appliedIds = new Set(me?.applications.map((a) => a.storeId));

  return (
    <PublicLayout>
      <div className="mx-auto max-w-6xl px-4 py-8">
        <p className="eyebrow">今月受け入れているお店</p>
        <h1 className="mt-2 font-display text-2xl font-extrabold sm:text-3xl">お店を探す</h1>
        <p className="mt-2 max-w-[40rem] text-sm leading-relaxed text-muted-foreground">
          条件はコーチがお店を取材して確認したものです。迷ったら応募の前にコーチに相談できます。
        </p>

        <div className="mt-6 flex flex-col gap-3 rounded-xl border bg-card p-4">
          <div className="flex flex-wrap gap-2" role="group" aria-label="エリア">
            <ChoiceChip selected={area === "all"} onClick={() => setArea("all")}>
              すべてのエリア
            </ChoiceChip>
            {AREAS.map((a) => (
              <ChoiceChip key={a} selected={area === a} onClick={() => setArea(a)}>
                {a}
              </ChoiceChip>
            ))}
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="こだわり条件">
            {STORE_TAGS.map((tag) => (
              <ChoiceChip key={tag} selected={tags.includes(tag)} onClick={() => toggleTag(tag)} className="min-h-9 px-3 text-xs">
                {tag}
              </ChoiceChip>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
            <label className="flex items-center gap-2 text-sm">
              <input id="open-only" type="checkbox" className="h-4 w-4 accent-[hsl(var(--primary))]" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} />
              受け入れ枠のあるお店だけ
            </label>
            <div className="flex items-center gap-2">
              <span className="tabular text-sm font-bold">{visible.length}件</span>
              <Select id="sort" aria-label="並び順" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="h-9 w-auto md:h-9">
                {Object.entries(SORTS).map(([key, s]) => (
                  <option key={key} value={key}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        </div>

        {visible.length === 0 ? (
          <div className="mt-8 rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            条件に合うお店がありません。こだわり条件を減らすか、エリアを広げてみてください。
          </div>
        ) : (
          <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {visible.map((store) => (
              <StoreCard key={store.id} store={store} applied={appliedIds.has(store.id)} onApply={() => apply(store.id)} />
            ))}
          </div>
        )}
      </div>
    </PublicLayout>
  );
}
