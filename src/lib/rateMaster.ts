// 料金・バック表（正本）：コース（back_rates）・オプション（option_rates）・指名（nomination_rates）を
// 1枚の表で直すための計算。ここで直した値が、セラピストのマイページのバック表・HPの料金・予約入力・面談用ページに出る。

export type RateKind = "course" | "option" | "nomination";

export const RATE_KINDS: RateKind[] = ["course", "option", "nomination"];

export const RATE_KIND_LABEL: Record<RateKind, string> = {
  course: "コース",
  option: "オプション",
  nomination: "指名",
};

export interface RateRow {
  /** 画面の行の目印（DBの id か、新しい行の仮の値） */
  key: string;
  /** DBの id。新しい行は null */
  id: string | null;
  kind: RateKind;
  name: string;
  /** コース＝時間（分）、オプション＝延長の分（無ければ null）、指名＝使わない */
  minutes: number | null;
  price: number;
  /** セラピストのバック。指名で「なし」は null */
  back: number | null;
  /** HPに出す（指名には無い） */
  visible: boolean;
  /** コースの説明（エスたま限定プランの中身など） */
  description: string;
}

export interface CourseRecord {
  id: string;
  course_type: string;
  duration: number;
  customer_price: number;
  therapist_back: number | null;
  is_visible: boolean | null;
  description: string | null;
}
export interface OptionRecord {
  id: string;
  option_name: string;
  customer_price: number;
  therapist_back: number | null;
  extension_minutes: number | null;
  is_visible: boolean | null;
}
export interface NominationRecord {
  id: string;
  nomination_type: string;
  customer_price: number;
  therapist_back: number | null;
}

/** 店落ち＝料金−バック */
export function shopBack(row: Pick<RateRow, "price" | "back">): number {
  return row.price - (row.back ?? 0);
}

/** DBの3つの表から、表の行に（並び順は読んだ順のまま） */
export function rowsFromRecords(courses: CourseRecord[], options: OptionRecord[], nominations: NominationRecord[]): RateRow[] {
  return [
    ...courses.map((row): RateRow => ({
      key: row.id, id: row.id, kind: "course", name: row.course_type, minutes: row.duration,
      price: row.customer_price ?? 0, back: row.therapist_back ?? 0, visible: row.is_visible !== false, description: row.description ?? "",
    })),
    ...options.map((row): RateRow => ({
      key: row.id, id: row.id, kind: "option", name: row.option_name, minutes: row.extension_minutes || null,
      price: row.customer_price ?? 0, back: row.therapist_back, visible: row.is_visible !== false, description: "",
    })),
    ...nominations.map((row): RateRow => ({
      key: row.id, id: row.id, kind: "nomination", name: row.nomination_type, minutes: null,
      price: row.customer_price ?? 0, back: row.therapist_back, visible: true, description: "",
    })),
  ];
}

/** 保存する前の確かめ。直すところを1行ずつ返す（空なら保存してよい） */
export function validateRateRows(rows: RateRow[]): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const label = `${RATE_KIND_LABEL[row.kind]}「${row.name || "（名前なし）"}${row.kind === "course" && row.minutes ? ` ${row.minutes}分` : ""}」`;
    if (!row.name.trim()) errors.push(`${RATE_KIND_LABEL[row.kind]}に名前が空の行があります`);
    if (row.kind === "course" && !(row.minutes && row.minutes > 0)) errors.push(`${label}の時間（分）を入れてください`);
    if (!Number.isFinite(row.price) || row.price < 0) errors.push(`${label}の料金が正しくありません`);
    if (row.kind === "course" && row.back === null) errors.push(`${label}のバックを入れてください`);
    if (row.back !== null && (!Number.isFinite(row.back) || row.back < 0)) errors.push(`${label}のバックが正しくありません`);
    if (row.back !== null && row.back > row.price) errors.push(`${label}のバックが料金より多くなっています`);
    const dup = `${row.kind}|${row.name.trim()}|${row.kind === "course" ? row.minutes : ""}`;
    if (row.name.trim() && seen.has(dup)) errors.push(`${label}が2行あります`);
    seen.add(dup);
  }
  return errors;
}

type Payload = Record<string, string | number | boolean | null>;

/** その行を保存するときの中身（order は種類ごとの並び順） */
export function rowPayload(row: RateRow, order: number): Payload {
  const shop = shopBack(row);
  if (row.kind === "course") {
    return {
      course_type: row.name.trim(), duration: row.minutes ?? 0, customer_price: row.price, therapist_back: row.back ?? 0,
      shop_back: shop, is_visible: row.visible, description: row.description.trim() || null, display_order: order,
    };
  }
  if (row.kind === "option") {
    return {
      option_name: row.name.trim(), extension_minutes: row.minutes ?? 0, customer_price: row.price, therapist_back: row.back,
      shop_back: shop, is_visible: row.visible, display_order: order,
    };
  }
  return { nomination_type: row.name.trim(), customer_price: row.price, therapist_back: row.back, shop_back: shop };
}

export interface RateSavePlan {
  kind: RateKind;
  inserts: Payload[];
  updates: Array<{ id: string; payload: Payload }>;
  deletes: string[];
}

/** 読んだときの行と今の行を比べて、足す・直す・消すを種類ごとに出す（変わっていない行は送らない） */
export function planRateSave(before: RateRow[], after: RateRow[]): RateSavePlan[] {
  return RATE_KINDS.map((kind) => {
    const beforeRows = before.filter((row) => row.kind === kind);
    const afterRows = after.filter((row) => row.kind === kind);
    const beforeById = new Map(beforeRows.map((row, index) => [row.id, rowPayload(row, index)]));
    const plan: RateSavePlan = { kind, inserts: [], updates: [], deletes: [] };
    afterRows.forEach((row, index) => {
      const payload = rowPayload(row, index);
      if (!row.id) { plan.inserts.push(payload); return; }
      const previous = beforeById.get(row.id);
      if (!previous || JSON.stringify(previous) !== JSON.stringify(payload)) plan.updates.push({ id: row.id, payload });
    });
    const kept = new Set(afterRows.map((row) => row.id).filter(Boolean));
    plan.deletes = beforeRows.map((row) => row.id).filter((id): id is string => !!id && !kept.has(id));
    return plan;
  });
}

export const RATE_TABLE_NAME: Record<RateKind, "back_rates" | "option_rates" | "nomination_rates"> = {
  course: "back_rates",
  option: "option_rates",
  nomination: "nomination_rates",
};

/** マイページのバック表（RPC get_therapist_back_table の中身） */
export interface TherapistBackTable {
  courses: Array<{ name: string; minutes: number; back: number | null }>;
  options: Array<{ name: string; minutes: number | null; back: number | null }>;
  nominations: Array<{ name: string; back: number | null }>;
}

export interface BackSection {
  title: string;
  rows: Array<{ key: string; label: string; back: number | null }>;
}

/** マイページで出す見出しごとの行。バックが 0 の指名・オプションも「なし」と出す */
export function therapistBackSections(table: TherapistBackTable | null): BackSection[] {
  if (!table) return [];
  const back = (value: number | null) => (value && value > 0 ? value : null);
  return [
    {
      title: "コース",
      rows: (table.courses ?? []).map((row, index) => ({ key: `c${index}`, label: `${row.name} ${row.minutes}分`, back: back(row.back) })),
    },
    {
      title: "オプション",
      rows: (table.options ?? []).map((row, index) => ({ key: `o${index}`, label: row.name, back: back(row.back) })),
    },
    {
      title: "指名",
      rows: (table.nominations ?? []).map((row, index) => ({ key: `n${index}`, label: row.name, back: back(row.back) })),
    },
  ].filter((section) => section.rows.length > 0);
}
