import assert from "node:assert/strict";
import test from "node:test";
import { estamaContactPlan, estamaTwitterId, splitEstamaPhone } from "../server/estama-store-contact-plan.ts";

test("エステ魂の連絡先の欄に入れる値", () => {
  assert.deepEqual(splitEstamaPhone("05012345678"), ["050", "1234", "5678"]);
  assert.deepEqual(splitEstamaPhone("0221234567"), ["022", "123", "4567"]);
  assert.equal(splitEstamaPhone("123"), null);
  assert.equal(estamaTwitterId("https://x.com/sample_id"), "sample_id");
  assert.equal(estamaTwitterId("@sample_id"), "sample_id");
  const plan = estamaContactPlan({ phone: "05012345678", line_url: "https://lin.ee/abc", email: "info@example.jp", x_url: "https://x.com/sample_id", blog_url: "https://m-sns.net/s/@sample" });
  assert.deepEqual(plan.contact, { "tel[0]": "050", "tel[1]": "1234", "tel[2]": "5678", sub_mail: "info@example.jp", shop_line_url: "https://lin.ee/abc" });
  assert.deepEqual(plan.info, { twitter_id: "sample_id", blog_url: "https://m-sns.net/s/@sample" });
  // 空の項目は触らない
  assert.deepEqual(estamaContactPlan({ phone: null, line_url: null, email: null, x_url: null, blog_url: null }), { contact: {}, info: {} });
});
