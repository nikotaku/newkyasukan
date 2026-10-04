import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSnsReadyLineText,
  buildSnsReadyPush,
  buildTherapistLineText,
  buildTherapistPush,
  describeChanges,
  unreachableAdminMessage,
  whenLabel,
} from "../supabase/functions/notify-therapist/messages.ts";

const context = {
  reservation_id: "11111111-2222-4333-8444-555555555555",
  cast_id: "cast-1",
  cast_name: "望月せな",
  customer_name: "山田",
  reservation_date: "2026-10-05",
  start_time: "20:30:00",
  duration: 80,
  extension_minutes: 0,
  course_name: "艶華コース",
  room: "インルーム",
  options: [],
  notes: null,
  price: 28000,
  payment_fee: 0,
  nomination_type: "本指名",
  discount_names: [],
  store_visit_count: 2,
  cast_visit_count: 1,
  cast_history: [],
};

const base = {
  portalUrl: "/therapist/token-abc",
  notificationId: "n-1",
  reservationId: context.reservation_id,
};

test("日時の表示：深夜は前日の営業日・24時以降で出す", () => {
  assert.equal(whenLabel("2026-10-05", "20:30:00"), "10月5日(月) 20:30〜");
  assert.equal(whenLabel("2026-10-06", "01:00:00"), "10月5日(月) 25:00〜");
  assert.equal(whenLabel(null, "20:00:00"), "");
});

test("新しい予約のプッシュ通知", () => {
  const message = buildTherapistPush({ ...base, kind: "new", context });
  assert.equal(message.title, "🔔 新しい予約 10月5日(月) 20:30〜21:50");
  assert.equal(message.body, "艶華コース 80分 / 山田様 / インルーム\n本指名");
  assert.equal(message.url, "/therapist/token-abc");
  assert.equal(message.tag, `reservation-${context.reservation_id}`);
});

test("変更のプッシュ通知に変更前→変更後が入る", () => {
  const message = buildTherapistPush({
    ...base,
    kind: "changed",
    context,
    changes: { start_time: "20:00:00", room: "ラズルーム" },
  });
  assert.equal(message.title, "✏️ 予約が変更されました 10月5日(月) 20:30〜21:50");
  assert.match(message.body, /日時 10月5日\(月\) 20:00 → 10月5日\(月\) 20:30/);
  assert.match(message.body, /ルーム ラズルーム → インルーム/);
});

test("変更点の並べ方", () => {
  assert.deepEqual(describeChanges({ course_name: "スタンダード", duration: 60 }, context), [
    "コース スタンダード 60分 → 艶華コース 80分",
  ]);
  assert.deepEqual(describeChanges({ options: ["延長"] }, context), ["オプション 延長 → なし"]);
  assert.deepEqual(describeChanges({}, context), []);
});

test("キャンセルと担当変更", () => {
  const snapshot = {
    reservation_date: "2026-10-05",
    start_time: "20:30:00",
    duration: 80,
    course_name: "艶華コース",
    customer_name: "山田",
  };
  const cancelled = buildTherapistPush({ ...base, kind: "cancelled", snapshot });
  assert.equal(cancelled.title, "❌ 予約がキャンセルされました");
  assert.equal(cancelled.body, "10月5日(月) 20:30〜\n艶華コース 80分 / 山田様");

  const moved = buildTherapistPush({ ...base, kind: "cancelled", snapshot: { ...snapshot, reason: "cast_changed" } });
  assert.equal(moved.title, "🔁 担当が変わりました");
  assert.match(moved.body, /別のセラピストが担当します/);
});

test("LINE用の文（移行中だけ）にマイページの案内が付く", () => {
  const created = buildTherapistLineText({ kind: "new", context });
  assert.match(created, /^🔔 新規予約のご案内/);
  assert.match(created, /マイページをホーム画面に追加/);

  const changed = buildTherapistLineText({ kind: "changed", context, changes: { room: "ラズルーム" } });
  assert.match(changed, /^✏️ 予約変更のお知らせ\n・ルーム ラズルーム → インルーム/);
  assert.match(changed, /【変更後の予約内容】/);
  assert.doesNotMatch(changed, /新規予約のご案内/);
});

test("届かなかったときの管理画面への通知", () => {
  const message = unreachableAdminMessage({
    castName: "望月せな",
    kind: "new",
    when: "10月5日(月) 20:30〜",
    reason: "no_device",
    notificationId: "n-1",
  });
  assert.equal(message.title, "⚠️ 望月せなさんに予約通知が届いていません");
  assert.match(message.body, /新しい予約。マイページのスマホ通知が未設定です/);
});

test("SNSアカウントの準備ができたお知らせ：マイページのSNSアカウントを開く", () => {
  const message = buildSnsReadyPush({ portalUrl: "/therapist/token-abc", castId: "cast-1" });
  assert.equal(message.title, "📱 XとO2のアカウントの準備ができました");
  assert.equal(message.url, "/therapist/token-abc?view=sns");
  assert.equal(message.tag, "sns-ready-cast-1");
  assert.match(buildSnsReadyLineText(), /① Xのトップ[\s\S]*④ 初回ポスト/);

  const admin = unreachableAdminMessage({ castName: "望月せな", kind: "sns_ready", when: "", reason: "no_device", notificationId: "n-2" });
  assert.equal(admin.title, "⚠️ 望月せなさんにSNSのお知らせが届いていません");
  assert.match(admin.body, /^SNSアカウント準備完了のお知らせ。マイページのスマホ通知が未設定です/);
});
