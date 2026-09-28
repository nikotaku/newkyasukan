// SMSの通数（Twilioの課金単位）の計算。
// 日本語を含む本文は1通70文字まで、70文字を超えると67文字ごとに1通分になる。
// 英数字と一部の記号だけ（GSM-7）なら1通160文字、超えると153文字ごと。

const GSM7_BASIC = "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ ÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM7_EXTENDED = "^{}\\[~]|€\f";

// Twilioの日本宛てSMSの1通分（円・2026年9月の料金表）。実際の料金は管理画面の残高表示を参照
export const JP_SMS_UNIT_PRICE_YEN = 14.36;

export interface SmsSegmentCount {
  encoding: "GSM-7" | "UCS-2";
  length: number;
  segments: number;
}

export function countSmsSegments(text: string): SmsSegmentCount {
  const chars = Array.from(text);
  if (chars.every((c) => GSM7_BASIC.includes(c) || GSM7_EXTENDED.includes(c))) {
    const length = chars.reduce((n, c) => n + (GSM7_EXTENDED.includes(c) ? 2 : 1), 0);
    return { encoding: "GSM-7", length, segments: length === 0 ? 0 : length <= 160 ? 1 : Math.ceil(length / 153) };
  }
  // 絵文字など（サロゲートペア）は2文字分として数える
  const length = text.length;
  return { encoding: "UCS-2", length, segments: length <= 70 ? 1 : Math.ceil(length / 67) };
}

// テンプレートの変数を例の値で埋める（送信時と同じく、値が空の変数を含む行は消す）
export const SMS_TEMPLATE_SAMPLE_VALUES: Record<string, string> = {
  name: "山田",
  customer_name: "山田",
  date: "9/27(日)",
  date_long: "9月27日(日)",
  time: "23:30",
  course: "艶華 80分",
  duration: "80",
  cast: "桐生まい",
  nomination: "ネット指名",
  price: "30,000",
  room: "艶月",
  room_address: "仙台市青葉区二日町11-15 In-Towner 201号室",
  room_landmark: "1階「はしもとや」",
  room_map: "https://x.gd/nf3ip",
};

export function fillSmsTemplateSample(template: string, values: Record<string, string> = SMS_TEMPLATE_SAMPLE_VALUES) {
  return template.split("\n").flatMap((line) => {
    let empty = false;
    const out = line.replace(/\{(\w+)\}/g, (match, key: string) => {
      if (!(key in values)) return match;
      if (!values[key]) empty = true;
      return values[key];
    });
    return empty ? [] : [out];
  }).join("\n");
}

export function describeSmsCost(text: string) {
  const { length, segments } = countSmsSegments(text);
  return {
    length,
    segments,
    yen: Math.round(segments * JP_SMS_UNIT_PRICE_YEN),
  };
}
