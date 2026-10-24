// 月別清算の固定費に出す「目安」の金額（薄い文字・タップで金額欄に入る）。
// 支払い管理の「サブスクの見張り」に入れた金額と、Twilio（SMS）の今月の使用額から作る。

export interface WatchForSuggestion {
  service: string;
  name: string;
  amount: number | null;
  billing_cycle: string | null;
  next_billing_date: string | null;
  is_active: boolean;
}

export interface SuggestionPart {
  label: string;
  amount: number;
}

export interface ExpenseSuggestion {
  amount: number;
  parts: SuggestionPart[];
}

/** サービス → 月別清算の固定費の項目 */
export const SERVICE_EXPENSE_CATEGORY: Record<string, string> = {
  estama: "広告媒体費（エスたま）",
  twilio: "通信費",
  subline: "通信費",
  ivry: "通信費",
  supabase: "通信費",
  vercel: "通信費",
  browserbase: "通信費",
  anthropic: "通信費",
};

const shortName = (name: string) => name.replace(/（.*?）|\(.*?\)/g, "").trim() || name;

/**
 * month = "yyyy-MM"。月払いは毎月、年払いは次の請求日がその月のときだけ数える。
 * twilioUsage は Twilio の今月の使用額（今月を見ているときだけ渡す）。渡したら見張りの Twilio の金額より優先する。
 */
export function expenseSuggestions(input: {
  month: string;
  watches: WatchForSuggestion[];
  twilioUsage?: number | null;
}): Record<string, ExpenseSuggestion> {
  const out: Record<string, ExpenseSuggestion> = {};
  const add = (category: string, part: SuggestionPart) => {
    if (!(part.amount > 0)) return;
    const entry = (out[category] ??= { amount: 0, parts: [] });
    entry.amount += part.amount;
    entry.parts.push(part);
  };

  const hasTwilioUsage = typeof input.twilioUsage === "number" && input.twilioUsage > 0;
  if (hasTwilioUsage) add("通信費", { label: "Twilio（今月の使用額）", amount: Math.round(input.twilioUsage!) });

  for (const watch of input.watches) {
    if (!watch.is_active || !watch.amount) continue;
    const category = SERVICE_EXPENSE_CATEGORY[watch.service];
    if (!category) continue;
    if (watch.service === "twilio" && hasTwilioUsage) continue;
    if (watch.billing_cycle === "yearly" && !(watch.next_billing_date ?? "").startsWith(input.month)) continue;
    add(category, { label: shortName(watch.name), amount: Math.round(watch.amount) });
  }
  return out;
}
