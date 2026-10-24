import assert from "node:assert/strict";
import test from "node:test";

import { expenseSuggestions } from "../src/lib/expenseSuggestions.ts";

const watch = (service: string, name: string, amount: number | null, extra: Partial<{ billing_cycle: string; next_billing_date: string; is_active: boolean }> = {}) => ({
  service, name, amount, billing_cycle: "monthly", next_billing_date: null, is_active: true, ...extra,
});

test("支払い管理の金額を固定費の項目ごとにまとめる", () => {
  const result = expenseSuggestions({
    month: "2026-10",
    watches: [
      watch("estama", "エステ魂（プラチナプラン）", 55000),
      watch("subline", "SUBLINE（050番号）", 1980),
      watch("vercel", "Vercel（HPの公開）", 3000),
      watch("supabase", "Supabase（データベース）", null),
      watch("ivry", "IVRy（電話の自動応答）", 3000, { is_active: false }),
    ],
  });
  assert.equal(result["広告媒体費（エスたま）"].amount, 55000);
  assert.equal(result["通信費"].amount, 4980);
  assert.deepEqual(result["通信費"].parts.map((p) => p.label), ["SUBLINE", "Vercel"]);
});

test("Twilio は今月の使用額を優先、年払いは請求月だけ", () => {
  const result = expenseSuggestions({
    month: "2026-10",
    twilioUsage: 1234.4,
    watches: [
      watch("twilio", "Twilio（SMS）", 5000),
      watch("anthropic", "Anthropic", 12000, { billing_cycle: "yearly", next_billing_date: "2026-11-03" }),
      watch("browserbase", "Browserbase", 24000, { billing_cycle: "yearly", next_billing_date: "2026-10-20" }),
    ],
  });
  assert.equal(result["通信費"].amount, 1234 + 24000);
  assert.equal(result["通信費"].parts[0].label, "Twilio（今月の使用額）");
  assert.equal(expenseSuggestions({ month: "2026-10", watches: [] })["通信費"], undefined);
});
