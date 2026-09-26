/**
 * Gmail に届く IVRy の着信通知と「【エステ魂】デイリーレポート」を、管理システムの問い合わせ集計へ送る。
 * レポートを受け取っている Gmail アカウントの Google Apps Script で動かす（手順: docs/gmail-report-sync.md）。
 *
 * - setup() を1回実行すると、15分ごとに syncReports() が動くようになる
 * - 初回は BACKFILL_SINCE 以降の分をまとめて送り、以降は直近2日分だけを送る
 * - 同じメールを何度送っても、取り込みは1回だけ（管理システム側で判定）
 */
const ENDPOINT = 'https://imrxzkivwrkqbhqfbbes.supabase.co/functions/v1/report-email-ingest';
// 管理システム側で発行したトークン。リポジトリには入れない
const TOKEN = 'PASTE_TOKEN_HERE';
const BACKFILL_SINCE = '2026/09/01';

const SEARCH_QUERY = '(IVRy OR エステ魂)';
const SUBJECT_PATTERN = /着信内容の報告通知[\s\S]*IVRy|エステ魂[\s\S]*デイリーレポート/i;
const BATCH_SIZE = 40;
const MAX_BODY_LENGTH = 20000;

function setup() {
  ScriptApp.getProjectTriggers()
    .filter(function (trigger) { return trigger.getHandlerFunction() === 'syncReports'; })
    .forEach(function (trigger) { ScriptApp.deleteTrigger(trigger); });
  ScriptApp.newTrigger('syncReports').timeBased().everyMinutes(15).create();
  syncReports();
}

// 取り込みをやり直したいとき（BACKFILL_SINCE 以降を送り直す）
function resendAll() {
  PropertiesService.getScriptProperties().deleteProperty('backfilled');
  syncReports();
}

function syncReports() {
  const props = PropertiesService.getScriptProperties();
  const backfilled = props.getProperty('backfilled') === 'yes';
  const range = backfilled ? 'newer_than:2d' : 'after:' + BACKFILL_SINCE;

  const messages = [];
  for (let start = 0; start < 2000; start += 100) {
    const threads = GmailApp.search(SEARCH_QUERY + ' ' + range, start, 100);
    threads.forEach(function (thread) {
      thread.getMessages().forEach(function (message) {
        const subject = message.getSubject() || '';
        if (!SUBJECT_PATTERN.test(subject)) return;
        messages.push({
          id: message.getId(),
          subject: subject,
          from: message.getFrom(),
          date: message.getDate().toISOString(),
          body: (message.getPlainBody() || '').slice(0, MAX_BODY_LENGTH),
        });
      });
    });
    if (threads.length < 100) break;
  }

  let imported = 0;
  for (let i = 0; i < messages.length; i += BATCH_SIZE) {
    const response = UrlFetchApp.fetch(ENDPOINT, {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-ingest-token': TOKEN },
      payload: JSON.stringify({ messages: messages.slice(i, i + BATCH_SIZE) }),
      muteHttpExceptions: true,
    });
    if (response.getResponseCode() !== 200) {
      throw new Error('送信に失敗しました（' + response.getResponseCode() + '）: ' + response.getContentText().slice(0, 300));
    }
    imported += JSON.parse(response.getContentText()).imported || 0;
  }
  if (!backfilled) props.setProperty('backfilled', 'yes');
  console.log(messages.length + '通を確認し、' + imported + '件を新しく取り込みました');
}
