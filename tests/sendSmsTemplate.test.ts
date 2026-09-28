import assert from "node:assert/strict";
import test from "node:test";

import { fillTemplate, reservationGuideUrl, toE164 } from "../supabase/functions/send-sms/template.ts";

test("案内ページのURLは店舗の独自ドメインとトークンから作る", () => {
  assert.equal(reservationGuideUrl("enka-salon.jp", "Ab3dE7fG9h_-"), "https://enka-salon.jp/r/Ab3dE7fG9h_-");
  assert.equal(reservationGuideUrl("https://enka-salon.jp/", "Ab3dE7fG9h_-"), "https://enka-salon.jp/r/Ab3dE7fG9h_-");
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
