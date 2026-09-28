import assert from "node:assert/strict";
import test from "node:test";

import { autoStatusFrom, estamaStage, MEDIA_COLUMNS, mediaProgress } from "../src/lib/mediaRegistration.ts";

test("進捗は手でチェックする8項目で数える", () => {
  assert.deepEqual(mediaProgress({}), { done: 0, total: 8, ratio: 0 });
  assert.equal(mediaProgress({ estama_listed: true, o2_created: true, x_created: true }).done, 3);
});

test("エステ魂の進み具合", () => {
  assert.equal(estamaStage({}, {}), "未登録");
  assert.equal(estamaStage({ estama_listed: true }, {}), "掲載のみ");
  assert.equal(estamaStage({ estama_listed: true }, { estama_synced: true }), "プロフィール連携済み");
  assert.equal(estamaStage({ estama_listed: true }, { estama_synced: true, estama_soul: true }), "魂セラピストまで完了");
});

test("自動でわかる項目は連携結果とログイン情報から出す", () => {
  const auto = autoStatusFrom({
    estamaProfile: { sync_status: "synced", soul_status: "configured", last_error: null },
    sns: { credential_configured: true, x_login_id: "" , x_credential_configured: false },
  });
  assert.deepEqual(auto, { estama_synced: true, estama_soul: true, o2_login: true, x_login: false, estama_error: null });
  assert.equal(autoStatusFrom({ sns: { x_login_id: "enka_hinata" } }).x_login, true);
  assert.equal(autoStatusFrom({}).estama_synced, false);
});

test("一覧の列はすべて「手で切り替え」か「自動」のどちらか", () => {
  for (const column of MEDIA_COLUMNS) assert.ok(Boolean(column.field) !== Boolean(column.auto), column.label);
});
