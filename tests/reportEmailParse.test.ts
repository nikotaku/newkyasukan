import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyReportEmail,
  estamaReportDate,
  parseEstamaDailyReport,
  parseEstamaReservationEmail,
  parseIvryCall,
} from "../supabase/functions/report-email-ingest/parse.ts";

test("エステ魂の仮予約メール本文から予約内容を読み取る", () => {
  const result = parseEstamaReservationEmail({
    id: "mail-abc123",
    subject: "【エステ魂】ご予約を受け付けました",
    from: "support@estama.jp",
    date: "2026-11-21T10:26:22.000Z",
    body: `
■お名前：山田 太郎
■メールアドレス：taro@example.com
■電話番号：080-1234-5678
■来店歴：新規
■ご要望：
SMSでお願いします。

━━━━━━━━━━━━━━
★ご予約内容
━━━━━━━━━━━━━━
■ご希望日時：11/22 (日) 20:30
■ご希望セラピスト：北乃みか
■ご希望コース：
艶華コース(70分)
■ご希望のクーポン：
===============================
新規割
===============================
ご新規様1000円オフ
----------------------------
ご利用料金の内訳
----------------------------
【指名料】1,000円
【コース料金】20,000円
合計金額：21,000円
`,
  });
  assert.deepEqual(result, {
    externalKey: "email:mail-abc123",
    receivedAt: "2026-11-21T10:26:22.000Z",
    hopeDate: "2026-11-22",
    hopeTime: "20:30",
    nominationLabel: "北乃みか",
    isFree: false,
    castName: "北乃みか",
    courseLabel: "艶華コース(70分)",
    courseMinutes: 70,
    coursePrice: 20000,
    nominationFee: 1000,
    totalPrice: 21000,
    coupon: "新規割／ご新規様1000円オフ",
    requestNote: "SMSでお願いします。",
    visitKind: "新規",
    memberLabel: null,
    customerName: "山田 太郎",
    customerPhone: "08012345678",
    customerEmail: "taro@example.com",
  });
});

test("フリー予約と年越しの希望日を読み取る", () => {
  const result = parseEstamaReservationEmail({
    id: "mail-year-end",
    subject: "【エステ魂】ご予約を受け付けました",
    date: "2026-12-31T06:00:00.000Z",
    body: `■お名前：テスト\n■ご希望日時：1/2 (土) 01:00\n■ご希望セラピスト：フリー（指名なし）\n■ご希望コース：\n艶華コース(60分)\n■ご希望のクーポン：\nなし\n----------------------------\nご利用料金の内訳\n----------------------------\n【コース料金】15,000円\n合計金額：15,000円`,
  });
  assert.equal("error" in result, false);
  if (!("error" in result)) {
    assert.equal(result.hopeDate, "2027-01-02");
    assert.equal(result.isFree, true);
    assert.equal(result.castName, null);
  }
});

test("件名でIVRyの着信通知とエステ魂のデイリーレポートを見分ける", () => {
  assert.equal(classifyReportEmail("【着信内容の報告通知】070-4201-3979からのお電話【IVRy】"), "ivry_call");
  assert.equal(classifyReportEmail("【エステ魂】デイリーレポート(9月8日集計分)"), "estama_daily_report");
  assert.equal(classifyReportEmail("【エステ魂】仮予約のお知らせ"), "estama_reservation");
  assert.equal(classifyReportEmail("【エステ魂】ご予約が入りました"), "estama_reservation");
  assert.equal(classifyReportEmail("お知らせ"), "unknown");
  // 転送されたメールでも送り元が estama.jp なら、件名に「エステ魂」が無くても仮予約
  assert.equal(classifyReportEmail("新しいご予約があります", "エステ魂 <noreply@estama.jp>"), "estama_reservation");
  assert.equal(classifyReportEmail("新しいご予約があります", "someone@example.com"), "unknown");
});

test("IVRyの着信は件名の番号と本文の着信日時・転送結果を使う", () => {
  const call = parseIvryCall({
    id: "1a085f82851f74dd",
    subject: "【着信内容の報告通知】070-4201-3979からのお電話【IVRy】",
    date: "2026-09-09T11:41:10.000Z",
    body: [
      "着信日時：2026/09/09 20:40:27",
      "受付種別：通常受付時（営業時間内）",
      "転送結果：正常終了（ブラウザ）",
      "詳細はこちら https://ivry.jp/xxx",
    ].join("\n"),
  });
  assert.equal(call.callerNumber, "070-4201-3979");
  assert.equal(call.inquiredAt, "2026-09-09T11:40:27.000Z");
  assert.equal(call.callStatus, "正常終了（ブラウザ）");
  assert.equal(call.memo, "着信日時:2026/09/09 20:40:27／受付種別:通常受付時（営業時間内）／転送結果:正常終了（ブラウザ）");
});

test("本文に日時がなければ受信時刻、非通知は番号なし", () => {
  const call = parseIvryCall({
    id: "abcdef123456",
    subject: "【着信内容の報告通知】非通知からのお電話【IVRy】",
    date: "2026-09-10T03:00:00.000Z",
    body: "",
  });
  assert.equal(call.callerNumber, null);
  assert.equal(call.inquiredAt, "2026-09-10T03:00:00.000Z");
  assert.equal(call.memo, null);
});

test("全角の番号も半角で保存する", () => {
  const call = parseIvryCall({
    id: "abcdef123456",
    subject: "【着信内容の報告通知】０１２０－２８６－６３４からのお電話【IVRy】",
    date: "2026-09-10T03:00:00.000Z",
    body: "",
  });
  assert.equal(call.callerNumber, "0120-286-634");
});

test("デイリーレポートの集計日は受信日の年で決め、年をまたぐ分は前年にする", () => {
  assert.equal(estamaReportDate("【エステ魂】デイリーレポート(9月8日集計分)", "2026-09-09T05:00:00.000Z"), "2026-09-08");
  assert.equal(estamaReportDate("【エステ魂】デイリーレポート(12月31日集計分)", "2027-01-01T05:00:00.000Z"), "2026-12-31");
});

test("デイリーレポートのアクセス数と問い合わせ数を読む（同じ行・次の行のどちらの書式でも）", () => {
  const sameLine = parseEstamaDailyReport({
    id: "1a084760e5cfbd31",
    subject: "【エステ魂】デイリーレポート(9月8日集計分)",
    date: "2026-09-09T05:00:00.000Z",
    body: "■店舗ページアクセス数：1,233\n■セラピストページ閲覧数：820\n■お問い合わせ数：0件\nhttps://estama.jp/admin/shop/51445/",
  });
  assert.deepEqual(sameLine, { reportDate: "2026-09-08", pageViews: 1233, inquiryCount: 0, externalStoreId: "51445" });

  const nextLine = parseEstamaDailyReport({
    id: "1a07a2975b709b14",
    subject: "【エステ魂】デイリーレポート(9月6日集計分)",
    date: "2026-09-07T05:00:00.000Z",
    body: "アクセス数\n１，９８６\n問い合わせ数\n4",
  });
  assert.deepEqual(nextLine, { reportDate: "2026-09-06", pageViews: 1986, inquiryCount: 4, externalStoreId: null });
});

test("読み取れない書式は推測で埋めずにエラーにする", () => {
  const result = parseEstamaDailyReport({
    id: "x1234567",
    subject: "【エステ魂】デイリーレポート(9月8日集計分)",
    date: "2026-09-09T05:00:00.000Z",
    body: "本日もご利用ありがとうございます。",
  });
  assert.deepEqual(result, { error: "本文からアクセス数を読み取れません" });
});

test("エステ魂の仮予約の自動音声（0120-286-634）を見分ける", async () => {
  const { isEstamaReservationCall } = await import("../supabase/functions/report-email-ingest/parse.ts");
  assert.equal(isEstamaReservationCall({ callerNumber: "0120-286-634", inquiredAt: "", callStatus: null, memo: null }), true);
  assert.equal(isEstamaReservationCall({ callerNumber: "09000000000", inquiredAt: "", callStatus: null, memo: null }), false);
});
