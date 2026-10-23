import assert from "node:assert/strict";
import test from "node:test";
import {
  safeUrl,
  forms,
  relationRequests,
  relationShopId,
  memberIds,
  parseVerificationMail,
  assertPage,
} from "../supabase/functions/o2-control/protocol.ts";

test("02以外のリダイレクト・フォーム送信先を拒否する", () => {
  for (const u of [
    "https://evil.test/x",
    "https://m-sns.net.evil.test/",
    "http://m-sns.net/",
    "https://user@ m-sns.net/",
    "https://x@m-sns.net/",
    "https://m-sns.net:444/x",
  ])
    assert.throws(() => safeUrl(u));
  assert.equal(
    safeUrl("/shop/relations/"),
    "https://m-sns.net/shop/relations/",
  );
  assert.equal(
    forms(
      '<form action="https://evil.test/"><input name="email"></form>',
      "https://m-sns.net/",
    ).length,
    0,
  );
});
const page = `<div id="request-123"><a href="/profile/@enka_test">テスト</a><button onclick="respond(123, 'approve')">承諾</button></div><div id="request-456"><a href="/profile/@enka_two">二人目</a></div><script>const SHOP_ID = 2335; fetch(BASE_URL+'/api/cast-shop/respond.php')</script>`;
test("連携申請を外部IDとユーザー名で分離する", () => {
  const rows = relationRequests(page, "https://m-sns.net/shop/relations/");
  assert.deepEqual(
    rows.map((r) => [r.remoteId, r.username]),
    [
      ["123", "enka_test"],
      ["456", "enka_two"],
    ],
  );
  assert.equal(relationShopId(page), "2335");
  assert.throws(() => relationShopId("<h1>申請なし</h1>"));
  assert.throws(() =>
    relationRequests(
      '<div id="request-123"><a href="/profile/@one">1</a><a href="/profile/@two">2</a></div>',
      "https://m-sns.net/",
    ),
  );
  assert.deepEqual([...memberIds('<div id="member-123"></div>')], ["123"]);
});
const at = Date.parse("2026-10-24T00:00:00Z");
const mail = {
  id: "mail-1",
  from: "02 <noreply@m-sns.net>",
  to: "inbox@gmail.com",
  originalTo: "cast@example.jp",
  subject: "02 メール認証",
  body: "認証コード：123456",
  date: "2026-10-23T23:59:00Z",
  authentication: "mx.google.com; dkim=pass header.d=m-sns.net; spf=pass",
};
test("Gmail転送前の宛先と送信元を確認する", () => {
  const parsed = parseVerificationMail(mail, at)!;
  assert.equal(parsed.code, "123456");
  assert.ok(parsed.recipients.includes("cast@example.jp"));
  for (const override of [
    { from: "noreply@evil.test" },
    { authentication: "" },
    { authentication: "dkim=pass header.d=m-sns.net.evil.test" },
    { date: "2026-10-23T23:00:00Z" },
    { body: "123456" },
    { body: "認証コード: 123456\n確認コード: 654321" },
    { date: "2026-10-24T00:05:00Z" },
  ])
    assert.equal(parseVerificationMail({ ...mail, ...override }, at), null);
});
test("認証できない画面を正常扱いしない", () => {
  assert.throws(() => assertPage("<h1>Site Unavailable</h1>"));
  assert.throws(() =>
    assertPage('<div class="g-recaptcha">' + "x".repeat(500) + "</div>"),
  );
});

test("プロフィール保存で既存の選択値と自由記入を消さない", () => {
  const f = forms(
    `<form method="post" action="/cast/profile/"><select name="area_id"><option value="23">東京</option><option value="46" selected>宮城</option></select><textarea name="comment">既存の紹介 &amp; メッセージ</textarea><input name="proxy_ok" type="checkbox" checked value="1"><input type="hidden" name="csrf_token" value="test-csrf"></form>`,
    "https://m-sns.net/cast/profile/",
  )[0];
  assert.equal(f.fields.area_id, "46");
  assert.equal(f.fields.comment, "既存の紹介 & メッセージ");
  assert.equal(f.fields.proxy_ok, "1");
  assert.equal(f.fields.csrf_token, "test-csrf");
});
