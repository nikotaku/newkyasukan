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
