// 講習（受講状況）のチェックリスト：項目ごとにチェックした数で％を出す

export type ChecklistItem = { id: string; label: string };

export type TrainingStatus = "not_started" | "in_progress" | "completed";

/** チェック項目がない講習は「受講した」1つのチェックとして扱う */
export const SINGLE_ITEM_ID = "done";

export function normalizeChecklist(value: unknown): ChecklistItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is { id: unknown; label: unknown } => !!v && typeof v === "object")
    .map((v) => ({ id: String(v.id ?? ""), label: String(v.label ?? "").trim() }))
    .filter((v) => v.id && v.label);
}

/** その講習で表示するチェック項目（無ければ「受講した」1つ） */
export function moduleItems(checklist: ChecklistItem[]): ChecklistItem[] {
  return checklist.length > 0 ? checklist : [{ id: SINGLE_ITEM_ID, label: "受講した" }];
}

/**
 * チェック済みの項目 id。checked_items が null（チェックリスト前の記録）なら、
 * 「完了」だった講習は全部チェック済みとして扱う
 */
export function checkedIds(
  checklist: ChecklistItem[],
  record: { status?: string | null; checked_items?: unknown } | null | undefined,
): Set<string> {
  const items = moduleItems(checklist);
  if (!record) return new Set();
  if (record.checked_items == null) {
    return record.status === "completed" ? new Set(items.map((i) => i.id)) : new Set();
  }
  const ids = Array.isArray(record.checked_items) ? record.checked_items.map(String) : [];
  const valid = new Set(items.map((i) => i.id));
  return new Set(ids.filter((id) => valid.has(id)));
}

export type ChecklistProgress = { done: number; total: number; pct: number };

export function progressOf(done: number, total: number): ChecklistProgress {
  return { done, total, pct: total > 0 ? Math.round((done / total) * 100) : 0 };
}

export function moduleProgress(
  checklist: ChecklistItem[],
  record: { status?: string | null; checked_items?: unknown } | null | undefined,
): ChecklistProgress {
  return progressOf(checkedIds(checklist, record).size, moduleItems(checklist).length);
}

/** いくつかの講習（カテゴリ・全体）をまとめた％。チェック項目の数で数える */
export function combinedProgress(parts: ChecklistProgress[]): ChecklistProgress {
  let done = 0;
  let total = 0;
  for (const p of parts) {
    done += p.done;
    total += p.total;
  }
  return progressOf(done, total);
}

export function statusFromProgress(p: ChecklistProgress): TrainingStatus {
  if (p.done <= 0) return "not_started";
  if (p.done >= p.total) return "completed";
  return "in_progress";
}

export function newChecklistItemId(): string {
  return Math.random().toString(36).slice(2, 10);
}

// ── カリキュラム管理：カテゴリの並び・講習のドラッグ移動 ──

/** カテゴリの一覧（並び順）を保存する site_content のキー */
export const TRAINING_CATEGORIES_KEY = "training_categories";

export function parseCategoryList(value: unknown): string[] {
  let raw = value;
  if (typeof raw === "string") {
    try { raw = JSON.parse(raw); } catch { return []; }
  }
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    const name = typeof item === "string" ? item.trim() : "";
    if (name && !seen.has(name)) { seen.add(name); out.push(name); }
  }
  return out;
}

/** 保存した並びのあとに、講習にだけあるカテゴリ（昔のデータ）を講習の順で足す */
export function orderedCategories(saved: string[], modules: { category: string; display_order: number }[]): string[] {
  const out = parseCategoryList(saved);
  const seen = new Set(out);
  for (const m of [...modules].sort((a, b) => a.display_order - b.display_order)) {
    if (!seen.has(m.category)) { seen.add(m.category); out.push(m.category); }
  }
  return out;
}

/** 並びの中の1つを、別の位置（to = 移動後の位置）へ */
export function moveInList<T>(list: T[], from: number, to: number): T[] {
  if (from < 0 || from >= list.length) return list;
  const next = [...list];
  const [moved] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(to, next.length)), 0, moved);
  return next;
}

type SortableModule = { id: string; category: string; display_order: number };

/**
 * 講習を targetCategory の beforeId の前（null ならそのカテゴリの最後）へ動かす。
 * カテゴリの並び順に沿って display_order を 10, 20, … と振り直し、変わった講習だけ返す。
 */
export function moveModule<M extends SortableModule>(
  modules: M[],
  categories: string[],
  moduleId: string,
  targetCategory: string,
  beforeId: string | null,
): { modules: M[]; changed: { id: string; category: string; display_order: number }[] } {
  const moving = modules.find((m) => m.id === moduleId);
  if (!moving || beforeId === moduleId) return { modules, changed: [] };
  const order = orderedCategories(categories.includes(targetCategory) ? categories : [...categories, targetCategory], modules);
  const byCategory = new Map<string, M[]>(order.map((c) => [c, []]));
  for (const m of [...modules].sort((a, b) => a.display_order - b.display_order)) {
    if (m.id !== moduleId) byCategory.get(m.category)?.push(m);
  }
  const target = byCategory.get(targetCategory) ?? [];
  const at = beforeId ? target.findIndex((m) => m.id === beforeId) : -1;
  target.splice(at >= 0 ? at : target.length, 0, { ...moving, category: targetCategory });
  byCategory.set(targetCategory, target);

  const changed: { id: string; category: string; display_order: number }[] = [];
  const next: M[] = [];
  let n = 0;
  for (const c of order) {
    for (const m of byCategory.get(c) ?? []) {
      n += 10;
      const before = modules.find((x) => x.id === m.id)!;
      if (before.display_order !== n || before.category !== m.category) changed.push({ id: m.id, category: m.category, display_order: n });
      next.push({ ...m, display_order: n });
    }
  }
  return { modules: next, changed };
}

/** カテゴリの並びに沿って display_order を 10, 20, … と振り直し、変わった講習だけ返す（カテゴリの並べ替え用） */
export function renumberByCategories<M extends SortableModule>(
  modules: M[],
  categories: string[],
): { modules: M[]; changed: { id: string; category: string; display_order: number }[] } {
  const order = orderedCategories(categories, modules);
  const sorted = [...modules].sort((a, b) => a.display_order - b.display_order);
  const next: M[] = [];
  const changed: { id: string; category: string; display_order: number }[] = [];
  let n = 0;
  for (const c of order) {
    for (const m of sorted.filter((x) => x.category === c)) {
      n += 10;
      if (m.display_order !== n) changed.push({ id: m.id, category: m.category, display_order: n });
      next.push({ ...m, display_order: n });
    }
  }
  return { modules: next, changed };
}
