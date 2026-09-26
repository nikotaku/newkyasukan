import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSmsReplyLineMessage,
  canSendSmsReplyNotice,
  smsThreadUrl,
  toLocalPhone,
  WEB_BOOKING_RESERVED_NOTIFICATIONS,
} from "../supabase/functions/sms-webhook/smsLineNotification.ts";

test("SMS返信の通知文にお客様名・番号・本文・予約・返信リンクを入れる", () => {
  const message = buildSmsReplyLineMessage({
    storeName: "艶華",
    customerName: "田中太郎",
    phone: "+819029715730",
    body: "時間的に厳しいので、桐生まいさんでお願いします！",
    reservation: { date: "2026-09-26", time: "17:30:00", castName: "桐生まい" },
    threadUrl: smsThreadUrl("enka-salon.jp", "+819029715730"),
  });
  assert.equal(message, [
    "💬 SMS返信（艶華）",
    "田中太郎 様（09029715730）",
    "",
    "時間的に厳しいので、桐生まいさんでお願いします！",
    "",
    "予約: 9/26(土) 17:30〜 桐生まい",
    "",
    "▶ 返信する: https://enka-salon.jp/sms?to=%2B819029715730",
  ].join("\n"));
});

test("名前や予約が分からなくても番号と本文だけで通知する", () => {
  const message = buildSmsReplyLineMessage({ storeName: null, customerName: null, phone: "+819000000000", body: "  " });
  assert.equal(message, "💬 SMS返信\nお客様（09000000000）\n\n（本文なし）");
});

test("長い本文は500文字で切る", () => {
  const message = buildSmsReplyLineMessage({ storeName: null, customerName: "A", phone: "+819000000000", body: "あ".repeat(600) });
  assert.ok(message.includes(`${"あ".repeat(500)}…`));
  assert.ok(!message.includes("あ".repeat(501)));
});

test("独自ドメインがない店舗は返信リンクを付けない", () => {
  assert.equal(smsThreadUrl(null, "+819000000000"), null);
  assert.equal(smsThreadUrl("https://enka-salon.jp/", "+819000000000"), "https://enka-salon.jp/sms?to=%2B819000000000");
  assert.equal(toLocalPhone("+81 90-1234-5678"), "09012345678");
});

test("WEB予約通知の予備分を残せるときだけ予約通知用アカウントから送る", () => {
  const reserve = WEB_BOOKING_RESERVED_NOTIFICATIONS;
  // 2人のグループ：予備 15回×2通=30通 と今回の2通が残っていれば送る
  assert.equal(canSendSmsReplyNotice({ limit: 200, used: 200 - (reserve * 2 + 2), members: 2 }), true);
  assert.equal(canSendSmsReplyNotice({ limit: 200, used: 200 - (reserve * 2 + 1), members: 2 }), false);
  assert.equal(canSendSmsReplyNotice({ limit: 200, used: 200, members: 2 }), false);
});

test("有料プランや残数を確認できないときは送る", () => {
  assert.equal(canSendSmsReplyNotice({ limit: null, used: 9_999, members: 3 }), true);
  assert.equal(canSendSmsReplyNotice(null), true);
});
