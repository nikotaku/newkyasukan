import assert from "node:assert/strict";
import test from "node:test";

import { buildO2NewsBody, pickO2NewsImage, plainArticleText } from "../src/lib/hpArticleO2.ts";

test("短い記事はタイトルと本文をそのまま", () => {
  assert.equal(buildO2NewsBody("新人入店", "## ようこそ\n**明るい**子です", "https://example.com/"), "【新人入店】\n\nようこそ\n明るい子です");
});

test("長い記事は切って最後にHPのリンクを付ける", () => {
  const body = buildO2NewsBody("お知らせ", "あ".repeat(2000), "https://example.com/", 200);
  assert.equal(body.length, 200);
  assert.ok(body.endsWith("…\n\n続きはHPで👇\nhttps://example.com/"));
  assert.ok(body.startsWith("【お知らせ】"));
});

test("画像は記事の1枚目、無ければお店の画像。許可されていない置き場所は使わない", () => {
  const store = "https://abc.supabase.co/storage/v1/object/public/x/hero.jpg";
  assert.equal(pickO2NewsImage(["https://abc.supabase.co/a.jpg"], [store]), "https://abc.supabase.co/a.jpg");
  assert.equal(pickO2NewsImage([], [null, store]), store);
  assert.equal(pickO2NewsImage(["https://evil.example/a.jpg"], ["http://abc.supabase.co/b.jpg"]), null);
});

test("本文の記号を外す", () => {
  assert.equal(plainArticleText("[予約](https://x) ![img](y)\n\n\n\n#見出し"), "予約\n\n見出し");
});
