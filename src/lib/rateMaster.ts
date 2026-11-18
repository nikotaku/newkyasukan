// 料金・割引・決済（正本）：コース（back_rates）・オプション（option_rates）・指名（nomination_rates）を
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

// ───────── 割引・決済方法（同じ正本のページで直す） ─────────

export type DiscountType = "fixed" | "percentage";

export interface DiscountRecord {
  id: string;
  name: string;
  discount_type: string;
  discount_value: number | string;
  is_active: boolean | null;
  display_order: number | null;
}

export interface DiscountRow {
  key: string;
  id: string | null;
  name: string;
  type: DiscountType;
  value: number;
  active: boolean;
}

export interface PaymentRecord {
  id: string;
  payment_method: string;
  fee_percentage: number | string;
  payment_link: string | null;
  customer_guide: string | null;
  is_active: boolean | null;
}

export interface PaymentRow {
  id: string;
  method: string;
  fee: number;
  link: string;
  guide: string;
  active: boolean;
}

export function discountRowsFromRecords(records: DiscountRecord[]): DiscountRow[] {
  return records.map((row) => ({
    key: row.id,
    id: row.id,
    name: row.name ?? "",
    type: row.discount_type === "percentage" || row.discount_type === "percent" ? "percentage" : "fixed",
    value: Number(row.discount_value) || 0,
    active: row.is_active !== false,
  }));
}

export function paymentRowsFromRecords(records: PaymentRecord[]): PaymentRow[] {
  return records.map((row) => ({
    id: row.id,
    method: row.payment_method,
    fee: Number(row.fee_percentage) || 0,
    link: row.payment_link ?? "",
    guide: row.customer_guide ?? "",
    active: row.is_active !== false,
  }));
}

/** 割引の中身（¥1,000引き / 10%OFF） */
export function discountValueLabel(row: Pick<DiscountRow, "type" | "value">): string {
  if (row.type === "percentage") return `${row.value}%OFF`;
  return row.value > 0 ? `¥${row.value.toLocaleString()}引き` : "金額の割引なし";
}

export function validateDiscountRows(rows: DiscountRow[]): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const label = `割引「${row.name || "（名前なし）"}」`;
    if (!row.name.trim()) errors.push("割引に名前が空の行があります");
    if (!Number.isFinite(row.value) || row.value < 0) errors.push(`${label}の値が正しくありません`);
    if (row.type === "percentage" && row.value > 100) errors.push(`${label}の％は100までです`);
    if (row.name.trim() && seen.has(row.name.trim())) errors.push(`${label}が2行あります`);
    seen.add(row.name.trim());
  }
  return errors;
}

export function validatePaymentRows(rows: PaymentRow[]): string[] {
  const errors: string[] = [];
  for (const row of rows) {
    if (!Number.isFinite(row.fee) || row.fee < 0 || row.fee > 100) errors.push(`決済方法「${row.method}」の手数料は0〜100％で入れてください`);
    if (row.link.trim() && !/^https?:\/\//i.test(row.link.trim())) errors.push(`決済方法「${row.method}」の決済リンクは https:// から入れてください`);
  }
  return errors;
}

type SimplePayload = Record<string, string | number | boolean | null>;

export interface SimpleSavePlan {
  inserts: SimplePayload[];
  updates: Array<{ id: string; payload: SimplePayload }>;
  deletes: string[];
}

function discountPayload(row: DiscountRow, order: number): SimplePayload {
  return { name: row.name.trim(), discount_type: row.type, discount_value: row.value, is_active: row.active, display_order: order };
}

/** 割引：足す・直す・消す（並び順は display_order に 1, 2, … と入れる） */
export function planDiscountSave(before: DiscountRow[], after: DiscountRow[]): SimpleSavePlan {
  const beforeById = new Map(before.map((row, index) => [row.id, discountPayload(row, index + 1)]));
  const plan: SimpleSavePlan = { inserts: [], updates: [], deletes: [] };
  after.forEach((row, index) => {
    const payload = discountPayload(row, index + 1);
    if (!row.id) { plan.inserts.push(payload); return; }
    const previous = beforeById.get(row.id);
    if (!previous || JSON.stringify(previous) !== JSON.stringify(payload)) plan.updates.push({ id: row.id, payload });
  });
  const kept = new Set(after.map((row) => row.id).filter(Boolean));
  plan.deletes = before.map((row) => row.id).filter((id): id is string => !!id && !kept.has(id));
  return plan;
}

function paymentPayload(row: PaymentRow): SimplePayload {
  // is_active はほかの画面で使っていないので送らない
  return { fee_percentage: row.fee, payment_link: row.link.trim() || null, customer_guide: row.guide.trim() || null };
}

/** 決済方法：直したものだけ（足す・消すは無し） */
export function planPaymentSave(before: PaymentRow[], after: PaymentRow[]): SimpleSavePlan {
  const beforeById = new Map(before.map((row) => [row.id, paymentPayload(row)]));
  const updates = after
    .map((row) => ({ id: row.id, payload: paymentPayload(row) }))
    .filter(({ id, payload }) => JSON.stringify(beforeById.get(id)) !== JSON.stringify(payload));
  return { inserts: [], updates, deletes: [] };
}

// ───────── 変更の記録（rate_master_changes） ─────────

export interface RateChangeRecord {
  id: number;
  changed_at: string;
  changed_by_email: string | null;
  table_name: string;
  action: "insert" | "update" | "delete";
  item_label: string;
  changes: Record<string, unknown>;
}

export const CHANGE_TABLE_LABEL: Record<string, string> = {
  back_rates: "コース",
  option_rates: "オプション",
  nomination_rates: "指名",
  discounts: "割引",
  payment_settings: "決済方法",
  deductions: "控除",
  allowances: "手当",
  referral_rewards: "広告費",
};

const FIELD_LABEL: Record<string, string> = {
  course_type: "名前",
  option_name: "名前",
  nomination_type: "名前",
  name: "名前",
  payment_method: "名前",
  duration: "時間",
  extension_minutes: "延長の時間",
  customer_price: "料金",
  therapist_back: "バック",
  is_visible: "HP表示",
  description: "説明",
  display_order: "並び順",
  discount_type: "割引の種類",
  discount_value: "割引の値",
  is_active: "使う",
  fee_percentage: "手数料",
  payment_link: "決済リンク",
  customer_guide: "お客様への手順",
  amount: "金額",
  deduction_type: "種類",
  allowance_type: "種類",
  rule: "決まり",
  note: "メモ",
};

const MONEY_FIELDS = new Set(["customer_price", "therapist_back", "amount"]);

function fieldValue(field: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "なし";
  if (typeof value === "boolean") return value ? "オン" : "オフ";
  if (MONEY_FIELDS.has(field) && Number.isFinite(Number(value))) return `¥${Number(value).toLocaleString()}`;
  if ((field === "duration" || field === "extension_minutes") && Number.isFinite(Number(value))) return `${Number(value)}分`;
  if (field === "fee_percentage") return `${Number(value)}%`;
  if (field === "deduction_type" || field === "allowance_type") return value === "percentage" ? "％" : "円";
  if (field === "discount_type") return value === "percentage" || value === "percent" ? "％引き" : "円引き";
  const text = String(value).replace(/\s+/g, " ");
  return text.length > 40 ? `${text.slice(0, 40)}…` : text;
}

/** 記録1件を「料金：¥15,000 → ¥16,000」の行に。足した・消したときは主な中身だけ */
export function describeRateChange(record: RateChangeRecord): string[] {
  const changes = record.changes ?? {};
  if (record.action === "update") {
    return Object.entries(changes)
      .filter(([field]) => field !== "display_order" || Object.keys(changes).length === 1)
      .map(([field, diff]) => {
        const { before, after } = (diff ?? {}) as { before?: unknown; after?: unknown };
        return `${FIELD_LABEL[field] ?? field}：${fieldValue(field, before)} → ${fieldValue(field, after)}`;
      });
  }
  const keys = ["customer_price", "therapist_back", "discount_value", "fee_percentage", "amount"].filter((key) => key in changes);
  return keys.map((key) => `${FIELD_LABEL[key]}：${fieldValue(key, changes[key])}`);
}
