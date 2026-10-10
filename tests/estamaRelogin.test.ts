import assert from "node:assert/strict";
import test from "node:test";

import { classifyLoginResult, scrubSecrets } from "../server/estama-relogin-result.ts";

test("ログイン後：セラピスト編集画面が開ければ成功", () => {
  assert.deepEqual(
    classifyLoginResult({ url: "https://estama.jp/admin/cast_edit/", hasEditor: true, hasPasswordField: false, validation: "" }),
    { ok: true },
  );
  assert.equal(
    classifyLoginResult({ url: "https://estama.jp/admin/", hasEditor: false, hasPasswordField: false, validation: "" }).ok,
    true,
  );
});

test("ログイン画面のまま：エステ魂のエラー文を返す・無ければ確認を促す", () => {
  const rejected = classifyLoginResult({
    url: "https://estama.jp/login/?r=/admin/cast_edit/",
    hasEditor: false,
    hasPasswordField: true,
    validation: "  メールアドレスまたはパスワードが\n違います ",
  });
  assert.equal(rejected.ok, false);
  assert.match(rejected.ok ? "" : rejected.error, /メールアドレスまたはパスワードが 違います/);
  const silent = classifyLoginResult({ url: "https://estama.jp/login/", hasEditor: false, hasPasswordField: true, validation: "" });
  assert.equal(silent.ok, false);
  assert.match(silent.ok ? "" : silent.error, /確認してください/);
  // 管理画面のURLでもパスワード欄が残っていれば失敗
  assert.equal(classifyLoginResult({ url: "https://estama.jp/admin/x", hasEditor: false, hasPasswordField: true, validation: "" }).ok, false);
});

test("エラー文からログイン情報を消す", () => {
  assert.equal(scrubSecrets("failed for shop@example.com with pass Secr3t!", ["Secr3t!", "shop@example.com"]), "failed for *** with pass ***");
  assert.equal(scrubSecrets("x".repeat(600), []).length, 500);
  assert.equal(scrubSecrets("ab short", ["ab"]), "ab short");
});
