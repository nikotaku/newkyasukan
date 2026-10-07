import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeDialNumber,
  parseMembers,
  pickCallMember,
  pushCallBody,
  sublineErrorMessage,
  toMemberView,
} from "../supabase/functions/subline/sublineApi.ts";
import { dialHref, isLikelyPhoneDevice } from "../src/lib/sublinePhone.ts";

test("発信する番号は数字だけ・+81は0に", () => {
  assert.equal(normalizeDialNumber("090-1234-5678"), "09012345678");
  assert.equal(normalizeDialNumber("+81 90 1234 5678"), "09012345678");
  assert.equal(normalizeDialNumber("０５０－１２３４－５６７８"), "05012345678");
  assert.equal(normalizeDialNumber("12345"), "");
  assert.equal(normalizeDialNumber(null), "");
});

test("メンバー一覧を読み、device_id は画面に返さない", () => {
  const members = parseMembers({
    status: "OK",
    member: [
      { account_code: "a1", account_name: "受付", group_name: "艶華", disp_number: "050-0000-0001", device_id: "dev-1" },
      { account_code: "a2", account_name: "店長", group_name: "艶華", disp_number: "050-0000-0002" },
      { account_name: "コードなし" },
    ],
  });
  assert.equal(members.length, 2);
  const view = toMemberView(members[0]);
  assert.deepEqual(view, { account_code: "a1", account_name: "受付", group_name: "艶華", number: "050-0000-0001", linked: true });
  assert.ok(!("device_id" in view));
  assert.equal(toMemberView(members[1]).linked, false);
  assert.deepEqual(parseMembers({ status: "NG" }), []);
});

test("通知を送るメンバー：設定した人（外部連携オン）→ 外部連携オンの最初の人", () => {
  const members = parseMembers({
    member: [
      { account_code: "a1", account_name: "A", disp_number: "1", device_id: "d1" },
      { account_code: "a2", account_name: "B", disp_number: "2", device_id: "d2" },
      { account_code: "a3", account_name: "C", disp_number: "3" },
    ],
  });
  assert.equal(pickCallMember(members, "a2")?.account_code, "a2");
  assert.equal(pickCallMember(members, "a3")?.account_code, "a1");
  assert.equal(pickCallMember(members, null)?.account_code, "a1");
  assert.equal(pickCallMember(members.slice(2), null), null);
  assert.deepEqual(pushCallBody(members[1], "09012345678", "山田様", "r-1"), {
    title: "SUBLINE", device_id: "d2", number: "09012345678", name: "山田様", icon: "", call_id: "r-1",
  });
});

test("エラーの中身を文字にする（[object Object] にしない）", () => {
  assert.equal(sublineErrorMessage({ error: { code: "AUTH", message: "invalid token" } }, 401), "invalid token");
  assert.equal(sublineErrorMessage({ error: "bad" }, 400), "bad");
  assert.equal(sublineErrorMessage({ status: "NG" }, 200), "NG");
  assert.equal(sublineErrorMessage(null, 500), "HTTP 500");
});

test("スマホは SUBLINE アプリを開くリンク、そうでなければ普通の電話リンク", () => {
  assert.equal(dialHref("090-1234-5678", { subline: true, phoneDevice: true }), "subline://?number=09012345678");
  assert.equal(dialHref("090-1234-5678", { subline: false, phoneDevice: true }), "tel:09012345678");
  assert.equal(dialHref("090-1234-5678", { subline: true, phoneDevice: false }), "tel:09012345678");
  assert.ok(isLikelyPhoneDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)"));
  assert.ok(isLikelyPhoneDevice("Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile"));
  assert.ok(!isLikelyPhoneDevice("Mozilla/5.0 (Windows NT 10.0; Win64; x64)"));
  assert.ok(!isLikelyPhoneDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"));
});
