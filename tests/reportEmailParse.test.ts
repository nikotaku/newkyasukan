import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyReportEmail,
  estamaReportDate,
  parseEstamaDailyReport,
  parseIvryCall,
} from "../supabase/functions/report-email-ingest/parse.ts";

test("件名でIVRyの着信通知とエステ魂のデイリーレポートを見分ける", () => {
  assert.equal(classifyReportEmail("【着信内容の報告通知】070-4201-3979からのお電話【IVRy】"), "ivry_call");
  assert.equal(classifyReportEmail("【エステ魂】デイリーレポート(9月8日集計分)"), "estama_daily_report");
  assert.equal(classifyReportEmail("【エステ魂】仮予約のお知らせ"), "unknown");
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
