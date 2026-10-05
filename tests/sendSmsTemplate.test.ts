import assert from "node:assert/strict";
import test from "node:test";

import { fillTemplate, reservationGuideUrl, toE164 } from "../supabase/functions/send-sms/template.ts";

test("案内ページのURLは店舗の独自ドメインとトークンから作る", () => {
  assert.equal(reservationGuideUrl("enka-salon.jp", "Ab3dE7fG9h_-"), "https://enka-salon.jp/g/Ab3dE7fG9h_-");
  assert.equal(reservationGuideUrl("https://enka-salon.jp/", "Ab3dE7fG9h_-"), "https://enka-salon.jp/g/Ab3dE7fG9h_-");
  assert.equal(reservationGuideUrl(null, "Ab3dE7fG9h_-"), "");
  assert.equal(reservationGuideUrl("enka-salon.jp", null), "");
  // 形式外のトークンはURLにしない
  assert.equal(reservationGuideUrl("enka-salon.jp", "../../admin"), "");
});

test("値が空の変数を含む行は消す（案内ページが作れないときはリンクの行ごと消える）", () => {
  const body = fillTemplate("{name}様 ご予約承りました\n予約内容・入室方法はこちら\n{guide_url}", { name: "菅原", guide_url: "" });
  assert.equal(body, "菅原様 ご予約承りました\n予約内容・入室方法はこちら");
  assert.equal(fillTemplate("{unknown}はそのまま", {}), "{unknown}はそのまま");
});

test("電話番号はE.164に揃える", () => {
  assert.equal(toE164("090-1234-5678"), "+819012345678");
  assert.equal(toE164("+819012345678"), "+819012345678");
  assert.equal(toE164("1234"), null);
});

test("カード・PayPayの予約だけ「リンクを開くと決済方法の案内が出ます」を出す", async () => {
  const { PAYMENT_GUIDE_NOTE, paymentGuideNote } = await import("../supabase/functions/send-sms/template.ts");
  const url = "https://enka-salon.jp/g/Ab3dE7fG9h_k";
  assert.equal(paymentGuideNote({ payment_method: "card" }, url), PAYMENT_GUIDE_NOTE);
  assert.equal(paymentGuideNote({ payment_method: "paypay" }, url), PAYMENT_GUIDE_NOTE);
  assert.equal(paymentGuideNote({ payment_method: "cash" }, url), "");
  // 案内ページのリンクが無ければ出さない
  assert.equal(paymentGuideNote({ payment_method: "card" }, ""), "");
  // 分割払いはカード・PayPayの分があるときだけ
  assert.equal(paymentGuideNote({ payment_method: "cash", payment_details: [{ method: "cash", amount: 10000 }, { method: "card", amount: 20000 }] }, url), PAYMENT_GUIDE_NOTE);
  assert.equal(paymentGuideNote({ payment_method: "card", payment_details: [{ method: "cash", amount: 30000 }, { method: "card", amount: 0 }] }, url), "");
  const template = "{name}様 ご予約承りました\n▼予約内容・入室方法・道順はこちら\n{guide_url}\n{payment_guide}\n変更はお電話で";
  assert.equal(
    fillTemplate(template, { name: "山田", guide_url: url, payment_guide: "" }),
    `山田様 ご予約承りました\n▼予約内容・入室方法・道順はこちら\n${url}\n変更はお電話で`,
  );
});
