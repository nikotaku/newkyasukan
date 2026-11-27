import assert from "node:assert/strict";
import test from "node:test";
import {
  applyO2Contact,
  hyphenatedPhone,
  o2ContactPlan,
  o2FormEntries,
  sameO2Value,
  unexpectedO2Changes,
} from "../server/o2-store-contact-plan.ts";

const values = { phone: "09012345678", line_url: "https://lin.ee/example", email: "shop@example.com", x_url: "https://x.com/example_shop", blog_url: "https://m-sns.net/s/@example" };

const formHtml = `
  <input type="hidden" name="csrf_token" value="abc">
  <input type="file" name="logo">
  <input type="text" name="shop_name" value="テスト店">
  <input type="tel" name="phone" value="09000000000">
  <input type="checkbox" name="show_schedule" value="1" checked>
  <input type="checkbox" name="show_members" value="1">
  <input type="url" name="twitter_link" value="https://x.com/old">
  <input type="url" name="line_link" value="">
  <textarea name="description">
一行目&amp;
二行目</textarea>
  <select name="area_id"><option value="">選択</option><option value="12" selected>仙台</option></select>
  <select name="job_type_id"><option value="3">メンズエステ</option><option value="4">その他</option></select>
  <button type="submit">保存</button>`;

test("電話はハイフン付き、X・LINEはURLのまま。メール・ブログは入れない", () => {
  assert.equal(hyphenatedPhone("090-1234-5678"), "090-1234-5678");
  assert.equal(hyphenatedPhone("0312345678"), "031-234-5678");
  assert.equal(hyphenatedPhone("123"), "");
  assert.deepEqual(o2ContactPlan(values), { phone: "090-1234-5678", twitter_link: "https://x.com/example_shop", line_link: "https://lin.ee/example" });
  assert.deepEqual(o2ContactPlan({ ...values, phone: "", x_url: "@bad id", line_url: null }), {});
});

test("フォームはブラウザと同じ中身で送り直す（file・ボタン・外れたチェックは送らない）", () => {
  assert.deepEqual(o2FormEntries(formHtml), [
    ["csrf_token", "abc"],
    ["shop_name", "テスト店"],
    ["phone", "09000000000"],
    ["show_schedule", "1"],
    ["twitter_link", "https://x.com/old"],
    ["line_link", ""],
    ["description", "一行目&\n二行目"],
    ["area_id", "12"],
    ["job_type_id", "3"],
  ]);
});

test("連絡先の欄だけ入れ替え、無い欄は知らせる", () => {
  const plan = o2ContactPlan(values);
  const { entries, missing } = applyO2Contact(o2FormEntries(formHtml), plan);
  assert.deepEqual(missing, []);
  assert.equal(new Map(entries).get("phone"), "090-1234-5678");
  assert.equal(new Map(entries).get("description"), "一行目&\n二行目");
  assert.deepEqual(applyO2Contact([["phone", ""]], plan).missing, ["twitter_link", "line_link"]);
});

test("電話はハイフンの有無を見ない・ほかの欄が変わったら見つける", () => {
  assert.ok(sameO2Value("phone", "09012345678", "090-1234-5678"));
  assert.ok(!sameO2Value("line_link", "https://lin.ee/x", "https://lin.ee/y"));
  const before = o2FormEntries(formHtml);
  const plan = o2ContactPlan(values);
  const after = applyO2Contact(before, plan).entries.map(([name, value]): [string, string] =>
    [name, name === "csrf_token" ? "new" : name === "description" ? value.replace("\n", "\r\n") : value]);
  assert.deepEqual(unexpectedO2Changes(before, after, plan), []);
  assert.deepEqual(unexpectedO2Changes(before, after.map(([name, value]): [string, string] => [name, name === "area_id" ? "1" : value]), plan), ["area_id"]);
});
