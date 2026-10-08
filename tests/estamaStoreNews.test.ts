import assert from "node:assert/strict";
import test from "node:test";
import {
  chooseEstamaNewsAdminLink,
  countEstamaNewsTitle,
  isConfirmedEstamaNewsPublication,
  normalizeEstamaNewsText,
} from "../server/estama-store-news-utils.ts";

test("店舗ニュース管理を写メ日記より優先して選ぶ", () => {
  const selected = chooseEstamaNewsAdminLink([
    { href: "https://estama.jp/admin/cast_diary/", text: "写メ日記管理" },
    { href: "https://estama.jp/admin/shop_news/", text: "店舗ニュース新規登録" },
    { href: "https://example.com/admin/news/", text: "ニュース" },
  ]);
  assert.equal(selected?.href, "https://estama.jp/admin/shop_news/");
});

test("公開ページ内の正規化済みタイトル件数を数える", () => {
  const html = "<h2>秋のご予約案内</h2><p>本文</p><h2>秋のご予約案内</h2>";
  assert.equal(normalizeEstamaNewsText("A<br>B&nbsp;C"), "A B C");
  assert.equal(countEstamaNewsTitle(html, "秋のご予約案内"), 2);
});

test("掲載確認は公開件数の増加または明示的成功だけを採用する", () => {
  const base = {
    publicCountBefore: 1,
    publicCountAfter: 1,
    successVisible: false,
    formVisible: true,
    currentBody: "送信本文",
    submittedBody: "送信本文",
    confirmationVisible: false,
  };
  assert.equal(isConfirmedEstamaNewsPublication(base), false);
  assert.equal(isConfirmedEstamaNewsPublication({ ...base, publicCountAfter: 2 }), true);
  assert.equal(isConfirmedEstamaNewsPublication({ ...base, successVisible: true }), true);
  assert.equal(isConfirmedEstamaNewsPublication({ ...base, currentBody: "" }), true);
  assert.equal(isConfirmedEstamaNewsPublication({ ...base, publicCountAfter: 2, confirmationVisible: true }), false);
});
