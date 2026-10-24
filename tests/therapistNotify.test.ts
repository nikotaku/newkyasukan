import assert from "node:assert/strict";
import test from "node:test";

import {
  buildNoticeLineText,
  buildNoticePush,
  buildSettlementLineText,
  buildSettlementPush,
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
  // LINEと同じ中身（開始時刻・割引・決済方法・決済状況を漏れなく）
  assert.match(message.body, /⏰ 開始 20:30（20:30〜21:50）/);
  assert.match(message.body, /💆 艶華コース 80分/);
  assert.match(message.body, /🏷️ 割引：なし/);
  assert.match(message.body, /💳 決済方法：現金/);
  assert.match(message.body, /🧾 決済状況：未決済（当日現金でお受け取り）/);
  assert.match(message.body, /⭐ 指名区分：本指名/);
  assert.match(message.body, /🏠 ルーム：インルーム/);
  assert.match(message.body, /お客様：山田 様/);
  assert.equal(message.body, buildTherapistLineText({ kind: "new", context }).split("\n").slice(2).join("\n").replace(/\n\n📲.*$/s, ""));
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

test("割引・決済方法・決済状況", () => {
  const paid = buildTherapistPush({
    ...base,
    kind: "new",
    context: {
      ...context,
      discount: 2000,
      discount_names: ["事前予約限定クーポン❷"],
      payment_method: null,
      payment_details: [{ method: "card", amount: 10000 }, { method: "cash", amount: 16000 }],
      payment_status: "unpaid",
      payment_fee: 1000,
    },
  });
  assert.match(paid.body, /🏷️ 割引：−2,000円（事前予約限定クーポン❷）/);
  assert.match(paid.body, /💳 決済方法：カード 10,000円＋現金 16,000円/);
  assert.match(paid.body, /🧾 決済状況：未決済（カード・PayPay分はお店が確認／残りは当日現金でお受け取り）/);
  assert.match(buildTherapistPush({ ...base, kind: "new", context: { ...context, payment_method: "paypay", payment_status: "paid" } }).body, /決済方法：PayPay\n🧾 決済状況：決済済み/);
  assert.deepEqual(
    describeChanges({ discount: 0, payment_method: "cash", payment_details: null, payment_status: "unpaid" }, { ...context, discount: 1000, payment_method: "card", payment_status: "paid" }),
    ["割引 −0円 → −1,000円", "決済方法 現金 → カード", "決済状況 未決済（お店が決済を確認します） → 決済済み"],
  );
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

test("精算の承認：不足分があるときは振込・相殺を選んでもらう。タップでマイページの精算を開く", () => {
  const snapshot = { clearance_id: "clr-1", date: "2026-10-05", salary: 26_000, cash_sales: 20_000, shortage: 6_000 };
  const push = buildSettlementPush({ portalUrl: "/therapist/tok", snapshot });
  assert.equal(push.title, "✅ 精算が承認されました（不足分があります）");
  assert.equal(push.body, "10月5日(月)の精算　お給料 ¥26,000\n不足分 ¥6,000 は、振込もしくは次回出勤日の相殺になります。マイページで選んでください");
  assert.equal(push.url, "/therapist/tok?settlement=clr-1");
  assert.equal(push.tag, "settlement-clr-1");

  const noShortage = buildSettlementPush({ portalUrl: "/therapist/tok", snapshot: { ...snapshot, shortage: 0 } });
  assert.equal(noShortage.title, "✅ 精算が承認されました");
  assert.match(noShortage.body, /明細はマイページで見られます/);
  assert.equal(buildSettlementPush({ portalUrl: "/therapist/tok", snapshot: { ...snapshot, re_approved: true } }).title, "✏️ 精算の内容が直りました");

  const line = buildSettlementLineText(snapshot);
  assert.match(line, /不足分 ¥6,000 は、振込もしくは次回出勤日の相殺になります/);
  assert.match(line, /ホーム画面に追加/);
});

test("不足分を振り込んだお知らせ", () => {
  const push = buildSettlementPush({
    portalUrl: "/therapist/token-abc",
    snapshot: { event: "shortage_paid", clearance_id: "c-1", date: "2026-10-14", shortage: 12000 },
  });
  assert.equal(push.title, "💴 不足分 ¥12,000 を振り込みました");
  assert.match(push.body, /10月14日\(水\)の精算の不足分 ¥12,000 をお振込みしました/);
  assert.equal(push.url, "/therapist/token-abc?settlement=c-1");
  assert.match(buildSettlementLineText({ event: "shortage_paid", date: "2026-10-14", shortage: 12000 }), /不足分 ¥12,000 を振り込みました/);
});

test("写真の確認依頼はマイページの「写真の確認」を開く", async () => {
  const { buildPhotoReviewPush, buildPhotoReviewLineText } = await import("../supabase/functions/notify-therapist/messages.ts");
  const push = buildPhotoReviewPush({ portalUrl: "/therapist/abc", count: 3, reviewId: "r1" });
  assert.equal(push.url, "/therapist/abc?view=photo-review");
  assert.match(push.body, /3枚/);
  assert.match(buildPhotoReviewLineText(3), /写真の確認/);
});

test("お店からのお知らせ：マイページのお知らせを開く", () => {
  const push = buildNoticePush({ portalUrl: "/therapist/abc", title: "清掃のお願い", important: true, noticeId: "n1" });
  assert.equal(push.title, "⚠️ お店から大事なお知らせ");
  assert.match(push.body, /清掃のお願い/);
  assert.equal(push.url, "/therapist/abc?view=notices");
  assert.equal(push.tag, "notice-n1");
  assert.equal(buildNoticePush({ portalUrl: "/therapist/abc" }).title, "📢 お店からのお知らせ");
  const text = buildNoticeLineText({ title: "シフト提出", body: "ルームが増えます" });
  assert.match(text, /^📢 お店からのお知らせ\n\n【シフト提出】\nルームが増えます/);
});
