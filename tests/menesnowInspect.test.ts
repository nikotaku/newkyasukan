import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyMenesnowLogin,
  findMenesnowChannel,
  menesnowLoginUrl,
  menesnowStoreId,
  normalizeMenesnowLinks,
  scrubJson,
} from "../server/menesnow-utils.ts";

const channel = (over: Record<string, unknown>) => ({
  id: "c", platform: "other", label: "", login_url: null, handle: null, password_configured: true, ...over,
});

test("メンエスなうの投稿先をURLか名前で見つける", () => {
  const list = [
    channel({ id: "x", platform: "x", label: "メンエスなう" }),
    channel({ id: "a", label: "エスたま", login_url: "https://estama.jp/login/" }),
    channel({ id: "b", label: "店舗", login_url: "https://men-esthe.co.jp/manage/store/6490/reservation-requests/" }),
  ];
  assert.equal(findMenesnowChannel(list)?.id, "b");
  assert.equal(findMenesnowChannel([channel({ id: "n", label: "メンエスなう（店舗）" })])?.id, "n");
  assert.equal(findMenesnowChannel([channel({ id: "a", label: "O2" })]), null);
});

test("店舗IDとログイン画面のURL", () => {
  assert.equal(menesnowStoreId(null, "https://men-esthe.co.jp/manage/store/6490/reservation-requests/"), "6490");
  assert.equal(menesnowStoreId("https://men-esthe.co.jp/"), null);
  assert.equal(menesnowLoginUrl("6490"), "https://men-esthe.co.jp/accounts/login/?next=%2Fmanage%2Fstore%2F6490%2F");
});

test("ログイン結果の判定", () => {
  assert.equal(classifyMenesnowLogin({ url: "https://men-esthe.co.jp/manage/store/6490/", hasPasswordField: false, errorText: "", blocked: false }).ok, true);
  const ng = classifyMenesnowLogin({ url: "https://men-esthe.co.jp/accounts/login/", hasPasswordField: true, errorText: " 正しいユーザー名とパスワードを入力してください ", blocked: false });
  assert.equal(ng.ok, false);
  assert.match(ng.ok ? "" : ng.error, /正しいユーザー名/);
  assert.equal(classifyMenesnowLogin({ url: "", hasPasswordField: false, errorText: "", blocked: true }).ok, false);
});

test("リンクは同じサイトだけ・重複とログアウトを除く", () => {
  const links = normalizeMenesnowLinks([
    { text: " 予約 リクエスト ", href: "/manage/store/6490/reservation-requests/" },
    { text: "dup", href: "https://men-esthe.co.jp/manage/store/6490/reservation-requests/" },
    { text: "ログアウト", href: "/accounts/logout/" },
    { text: "外部", href: "https://example.com/" },
  ]);
  assert.deepEqual(links, [{ text: "予約 リクエスト", path: "/manage/store/6490/reservation-requests/" }]);
});

test("結果にログイン情報を出さない", () => {
  const json = JSON.stringify({ text: 'id shop@example.jp pass a"b\\c' });
  const out = scrubJson(json, ["shop@example.jp", 'a"b\\c', "x"]);
  assert.ok(!out.includes("shop@example.jp"));
  assert.deepEqual(JSON.parse(out), { text: "id *** pass ***" });
});
