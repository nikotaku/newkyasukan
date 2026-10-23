// 面談用ページの「料金・報酬システム」：お客様の料金・セラピストのバック・店落ちを1つの表にする
export type SystemItem = {
  key: string;
  label: string;
  /** お客様の料金 */
  price: number;
  /** セラピストのバック（無いものは 0） */
  back: number;
  /** 店落ち＝料金 − バック */
  shop: number;
  note?: string | null;
};

export function systemItem(key: string, label: string, price: number | null, back: number | null, note?: string | null): SystemItem {
  const p = Math.max(0, price ?? 0);
  const b = Math.max(0, back ?? 0);
  return { key, label, price: p, back: b, shop: p - b, note: note ?? null };
}

/** 鉄板の組み合わせ（艶華コース80分＋オプションパック -牡丹-）。料金表に無ければ null */
export const SIGNATURE_COURSE = { course_type: "艶華", duration: 80 };
export const SIGNATURE_OPTION = "オプションパック -牡丹-";

export function signatureCombo(course: SystemItem | undefined, option: SystemItem | undefined) {
  if (!course || !option) return null;
  return {
    label: `${course.label}＋${option.label}`,
    price: course.price + option.price,
    back: course.back + option.back,
    shop: course.shop + option.shop,
  };
}
