import assert from "node:assert/strict";
import test from "node:test";
import { normalizeContact, normalizeXUrl, validateContact } from "../src/lib/storeContact.ts";

const emailOk = (email: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);

test("正本の入れ方をそろえる", () => {
  assert.equal(normalizeXUrl("@sample_id"), "https://x.com/sample_id");
  assert.equal(normalizeXUrl("https://twitter.com/sample_id?s=1"), "https://x.com/sample_id");
  const values = normalizeContact({ phone: "０５０-１２３４-５６７８", line_url: " https://lin.ee/abc ", email: "Info@Example.jp", x_url: "@sample_id", blog_url: "https://m-sns.net/s/@sample" });
  assert.deepEqual(values, { phone: "05012345678", line_url: "https://lin.ee/abc", email: "info@example.jp", x_url: "https://x.com/sample_id", blog_url: "https://m-sns.net/s/@sample" });
  assert.equal(validateContact(values, emailOk), null);
});

test("おかしな入れ方は理由を返す", () => {
  const base = { phone: "05012345678", line_url: "", email: "", x_url: "", blog_url: "" };
  assert.match(validateContact({ ...base, phone: "123" }, emailOk) ?? "", /電話番号/);
  assert.match(validateContact({ ...base, line_url: "https://example.com" }, emailOk) ?? "", /公式LINE/);
  assert.match(validateContact({ ...base, email: "abc" }, emailOk) ?? "", /メール/);
  assert.match(validateContact({ ...base, x_url: "https://x.com/" }, emailOk) ?? "", /X/);
  assert.match(validateContact({ ...base, blog_url: "m-sns.net" }, emailOk) ?? "", /外部ブログ/);
  assert.equal(validateContact(base, emailOk), null);
});
