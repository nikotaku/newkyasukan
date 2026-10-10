import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AUTO_REPLY_FOOTER,
  buildAutoReplyPrompt,
  finalizeReply,
  formatFacts,
  messageToText,
  SKIP_TOKEN,
  tokyoClock,
  verifyLineSignature,
  type StoreFacts,
} from "../supabase/functions/_shared/lineCustomerReply.ts";

const facts: StoreFacts = {
  storeName: "艶華",
  hours: "12:00〜26:00",
  holiday: "年中無休",
  address: "宮城県仙台市青葉区",
  phone: "05017856945",
  siteUrl: "https://enka-salon.jp",
  courses: [{ type: "スタンダード", minutes: 90, price: 16000 }],
  options: [{ name: "延長30分", price: 6000 }],
  nominations: [{ type: "本指名", price: 2000 }],
  shifts: [
    { name: "りりか", date: "2026-10-11", start: "18:00:00", end: "24:00:00" },
    { name: "ももか", date: "2026-10-11", start: "12:00:00", end: "20:00:00" },
    { name: "あおい", date: "2026-10-12", start: null, end: null },
  ],
  today: "2026-10-11",
  now: "15:20",
  instructions: "駐車場はありません",
};

test("営業日は朝6時で切り替わる", () => {
  assert.equal(tokyoClock(new Date("2026-10-10T20:30:00Z")).businessDate, "2026-10-10"); // 10/11 5:30 JST → 前日
  assert.equal(tokyoClock(new Date("2026-10-10T14:30:00Z")).businessDate, "2026-10-10"); // 23:30 JST
  assert.equal(tokyoClock(new Date("2026-10-10T21:30:00Z")).businessDate, "2026-10-11"); // 6:30 JST
  assert.equal(tokyoClock(new Date("2026-10-10T21:30:00Z")).tomorrow, "2026-10-12");
});

test("参照データに料金・出勤（時間順）・予約先が入る", () => {
  const text = formatFacts(facts);
  assert.match(text, /スタンダード 90分 16,000円/);
  assert.match(text, /本日10\/11\(日\)の出勤: ももか 12:00〜20:00 \/ りりか 18:00〜24:00/);
  assert.match(text, /明日10\/12\(月\)の出勤: あおい/);
  assert.match(text, /WEB予約: https:\/\/enka-salon\.jp\/booking/);
  assert.match(formatFacts({ ...facts, shifts: [] }), /本日10\/11\(日\)の出勤: 登録なし/);
});

test("プロンプトに会話と追加の指示が入り、予約を確定しないルールがある", () => {
  const { system, user } = buildAutoReplyPrompt(facts, [
    { direction: "in", text: "今日の夜って空いてますか？", created_at: "" },
    { direction: "in", text: "  ", created_at: "" },
  ]);
  assert.match(system, /予約を確定させない/);
  assert.match(system, /駐車場はありません/);
  assert.match(system, new RegExp(SKIP_TOKEN));
  assert.match(user, /お客様: 今日の夜って空いてますか？/);
  assert.doesNotMatch(user, /お客様: \s*\n/);
});

test("返事の整え方：返事不要は送らない・自動応答の一文を付ける", () => {
  assert.equal(finalizeReply(SKIP_TOKEN), null);
  assert.equal(finalizeReply("  "), null);
  const out = finalizeReply("お問い合わせありがとうございます。");
  assert.equal(out, `お問い合わせありがとうございます。\n\n${AUTO_REPLY_FOOTER}`);
  assert.ok((finalizeReply("あ".repeat(2000)) ?? "").length < 1000);
});

test("LINEのメッセージの種類を文字にする", () => {
  assert.equal(messageToText({ type: "text", text: "こんにちは" }), "こんにちは");
  assert.equal(messageToText({ type: "sticker" }), "[スタンプ]");
  assert.equal(messageToText({ type: "file", fileName: "a.pdf" }), "[ファイル: a.pdf]");
  assert.equal(messageToText(undefined), null);
});

test("Webhookの署名を確かめる", async () => {
  const secret = "0123456789abcdef0123456789abcdef";
  const body = JSON.stringify({ events: [] });
  const { createHmac } = await import("node:crypto");
  const signature = createHmac("sha256", secret).update(body).digest("base64");
  assert.equal(await verifyLineSignature(body, signature, secret), true);
  assert.equal(await verifyLineSignature(body + " ", signature, secret), false);
  assert.equal(await verifyLineSignature(body, null, secret), false);
});
