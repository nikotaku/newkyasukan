import assert from "node:assert/strict";
import test from "node:test";

import {
  autoStatusFrom,
  ESTHE_RANKING_ACTIVE,
  estamaStage,
  MEDIA_CHECKLIST_FIELDS,
  MEDIA_COLUMNS,
  MEDIA_NAMES,
  mediaProgress,
} from "../src/lib/mediaRegistration.ts";

test("進捗は手でチェックする項目で数える", () => {
  assert.deepEqual(mediaProgress({}), { done: 0, total: MEDIA_CHECKLIST_FIELDS.length, ratio: 0 });
  assert.equal(mediaProgress({ estama_listed: true, o2_created: true, x_created: true }).done, 3);
});

test("エスランは掲載していない間は一覧にも進捗にも出さない", () => {
  assert.equal(ESTHE_RANKING_ACTIVE, false);
  assert.equal(MEDIA_CHECKLIST_FIELDS.includes("esuran_listed"), false);
  assert.equal(MEDIA_CHECKLIST_FIELDS.length, 7);
  assert.deepEqual(MEDIA_NAMES, ["エステ魂", "O2", "X", "マイページ"]);
  // 掲載していなくても、以前のチェックが進捗に数えられない
  assert.equal(mediaProgress({ esuran_listed: true }).done, 0);
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
  assert.deepEqual(auto, {
    estama_synced: true, estama_soul: true, o2_login: true, x_login: false,
    portal_app: false, portal_test: false, estama_error: null,
  });
  assert.equal(autoStatusFrom({ sns: { x_login_id: "enka_hinata" } }).x_login, true);
  assert.equal(autoStatusFrom({}).estama_synced, false);
});

test("一覧の列はすべて「手で切り替え」か「自動」のどちらか", () => {
  for (const column of MEDIA_COLUMNS) assert.ok(Boolean(column.field) !== Boolean(column.auto), column.label);
});

test("マイページ：ホーム画面に追加して通知をオンにし、テスト通知を受け取ったら完了", () => {
  assert.deepEqual(
    (({ portal_app, portal_test }) => ({ portal_app, portal_test }))(autoStatusFrom({ portalDevices: [] })),
    { portal_app: false, portal_test: false },
  );
  // ブラウザのまま通知をオンにしただけでは「ホーム画面」に数えない
  assert.equal(autoStatusFrom({ portalDevices: [{ standalone: false, test_confirmed_at: "2026-10-04T05:00:00Z" }] }).portal_app, false);
  assert.equal(autoStatusFrom({ portalDevices: [{ standalone: false, test_confirmed_at: "2026-10-04T05:00:00Z" }] }).portal_test, false);
  const added = autoStatusFrom({ portalDevices: [{ standalone: true, test_confirmed_at: null }] });
  assert.equal(added.portal_app, true);
  assert.equal(added.portal_test, false);
  assert.equal(autoStatusFrom({ portalDevices: [{ standalone: true, test_confirmed_at: "2026-10-04T05:00:00Z" }] }).portal_test, true);
});
