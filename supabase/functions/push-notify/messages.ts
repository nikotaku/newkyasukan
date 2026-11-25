// 管理画面アプリへのプッシュ通知の文面。LINE通知と同じ内容を短くまとめる（ロック画面で読める長さ）。

import { businessDateShort, businessDateTime } from "../../../src/lib/businessTime.ts";

export interface PushMessage {
  title: string;
  body: string;
  url: string; // 通知をタップしたときに開く管理画面のページ
  tag: string; // 同じ tag の通知は上書きされる
}

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

function dateLabel(date: string | null) {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return "";
  const [y, m, d] = date.split("-").map(Number);
  return `${m}/${d}(${WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]})`;
}

// 予約の日時。深夜（6時前）は前日の24時台・25時台で書く（11/18 0:00 → 11/17(火) 24:00〜）
function businessWhen(date: string | null, time: string | null) {
  const when = businessDateTime(date, time);
  if (!when) return "";
  return [businessDateShort(when), when.time ? `${when.time}〜` : ""].filter(Boolean).join(" ");
}

const clip = (text: string, max: number) => {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
};

export function webBookingMessage(reservation: {
  id: string;
  booking_origin: string | null;
  reservation_date: string | null;
  start_time: string | null;
  duration: number | null;
  course_name: string | null;
  customer_name: string | null;
  price: number | null;
  nomination_type: string | null;
}, castName: string | null, courseLimit: { max_minutes: number } | null = null): PushMessage {
  const when = businessWhen(reservation.reservation_date, reservation.start_time);
  const course = [reservation.course_name, reservation.duration ? `${reservation.duration}分` : ""].filter(Boolean).join(" ");
  const who = [
    castName ? `${castName}${reservation.nomination_type && reservation.nomination_type !== "フリー" ? `（${reservation.nomination_type}）` : ""}` : "指名なし",
    reservation.customer_name ? `${reservation.customer_name}様` : "",
  ].filter(Boolean).join(" / ");
  const lines = [[when, course].filter(Boolean).join(" "), who];
  if (reservation.price) lines.push(`¥${Number(reservation.price).toLocaleString("ja-JP")}`);
  // 新規のお客様のコースの上限（casts.new_customer_max_minutes）を超えた予約。予約は受けたまま知らせる
  if (courseLimit) lines.unshift(`⚠️ ${castName ?? "このセラピスト"}さんは新規のお客様は${courseLimit.max_minutes}分まで。コースの確認が必要です`);
  const baseTitle = reservation.booking_origin === "cast_form" ? "🔔 セラピストの予約フォームから予約" : "🔔 WEB予約が入りました";
  return {
    title: courseLimit ? `⚠️ 新規${courseLimit.max_minutes}分超え：${baseTitle.replace("🔔 ", "")}` : baseTitle,
    body: lines.filter(Boolean).join("\n"),
    // 予約一覧（スケジュールダッシュボード）の受付元のタブを開く
    url: `/schedule-dashboard?tab=reservations&source=${reservation.booking_origin === "cast_form" ? "cast_form" : "web_form"}`,
    tag: `booking-${reservation.id}`,
  };
}

export function smsReplyMessage(input: { fromNumber: string; body: string; customerName: string | null }): PushMessage {
  const local = input.fromNumber.replace(/^\+81/, "0");
  return {
    title: `💬 SMSの返信${input.customerName ? `（${input.customerName}様）` : ""}`,
    body: `${clip(input.body || "（本文なし）", 120)}\n${local}`,
    url: `/sms?to=${encodeURIComponent(input.fromNumber)}`,
    tag: `sms-${input.fromNumber}`,
  };
}

// Twilio のエラー番号を、何をすればよいか分かる言葉にする（番号は https://www.twilio.com/docs/api/errors ）
const SMS_ERROR_REASONS: Record<string, string> = {
  "21211": "電話番号の形式が正しくありません",
  "21408": "この国あての送信が許可されていません",
  "21610": "お客様がSMSの受け取りを止めています（STOP）",
  "21612": "この番号には送れません",
  "21614": "携帯電話の番号ではありません",
  "30003": "相手の電話につながりません（電源オフ・圏外など）",
  "30004": "お客様の電話・携帯会社で受け取りを拒否しています",
  "30005": "この番号は使われていないか、存在しません",
  "30006": "固定電話など、SMSを受け取れない番号です",
  "30007": "携帯会社に迷惑SMSとして止められました",
  "30008": "携帯会社側の原因で届きませんでした",
};

export function smsFailureReason(code: string | null | undefined, message?: string | null) {
  const key = String(code ?? "").trim();
  if (SMS_ERROR_REASONS[key]) return SMS_ERROR_REASONS[key];
  if (key) return `送信エラー（${key}）${message ? `：${message}` : ""}`;
  return message || "届きませんでした（理由は不明）";
}

// お客様へのSMSが送れなかった・届かなかったとき（Twilio の送信エラーと、あとから届く「届かなかった」の知らせ）。
// retryState：scheduled＝自動で送り直し中（最初の失敗のときだけ知らせる）／not_retryable＝送り直しても届かない番号／
// gave_up＝送り直しても届かなかった（または予約の時間を過ぎた）。tag は最初のSMSごとにそろえ、あとの知らせで置き換える
export function smsFailedMessage(input: {
  logId: string;
  rootId?: string | null;
  toNumber: string;
  errorCode: string | null;
  errorMessage: string | null;
  customerName: string | null;
  reservationDate?: string | null;
  startTime?: string | null;
  retryState?: string | null;
  retryCount?: number | null;
}): PushMessage {
  const local = input.toNumber.replace(/^\+81/, "0");
  const when = businessWhen(input.reservationDate ?? null, input.startTime ?? null);
  const who = input.customerName ? `（${input.customerName}様）` : "";
  const state = input.retryState ?? null;
  const contact = `${local}　電話など別の方法で連絡してください`;
  const title = state === "scheduled"
    ? `⚠️ SMSが届きませんでした${who}`
    : state === "gave_up"
      ? `⚠️ SMSを送り直しても届きませんでした${who}`
      : `⚠️ SMSを送れませんでした${who}`;
  const next = state === "scheduled"
    ? "自動で送り直しています（届くまで最大6回）。結果はまたお知らせします"
    : state === "gave_up"
      ? `${input.retryCount ? `${input.retryCount}回送り直しましたが届きませんでした。` : ""}${contact}`
      : state === "not_retryable"
        ? `この番号には送り直しても届きません。${contact}`
        : contact;
  const lines = [smsFailureReason(input.errorCode, input.errorMessage), when ? `予約：${when}` : null, next].filter(Boolean);
  return {
    title,
    body: clip(lines.join("／"), 160),
    url: `/sms?to=${encodeURIComponent(input.toNumber)}`,
    tag: `sms-failed-${input.rootId || input.logId}`,
  };
}

// 自動の送り直しで届いたとき（最初の「届きませんでした」の通知を置き換える）
export function smsRetryDeliveredMessage(input: {
  rootId: string;
  toNumber: string;
  customerName: string | null;
  retryCount: number;
  reservationDate?: string | null;
  startTime?: string | null;
}): PushMessage {
  const when = businessWhen(input.reservationDate ?? null, input.startTime ?? null);
  return {
    title: `✅ SMSが届きました${input.customerName ? `（${input.customerName}様）` : ""}`,
    body: clip([`送り直し${input.retryCount}回目で届きました`, when ? `予約：${when}` : null].filter(Boolean).join("／"), 160),
    url: `/sms?to=${encodeURIComponent(input.toNumber)}`,
    tag: `sms-failed-${input.rootId}`,
  };
}

export function smsBalanceMessage(effectiveBalance: number): PushMessage {
  return {
    title: "⚠️ SMSの残高が少なくなっています",
    body: `残り 約${Math.round(effectiveBalance).toLocaleString("ja-JP")}円。0円になるとSMSが送れなくなります。Twilioでチャージしてください`,
    url: "/system/sms-auto",
    tag: "sms-balance",
  };
}

export function testMessage(): PushMessage {
  return {
    title: "✅ 通知のテスト",
    body: "この端末に通知が届きました。WEB予約・SMSの返信・精算の入力などをお知らせします",
    url: "/settings/notifications",
    tag: "test",
  };
}

export function estamaScoutMessage(batch: {
  id: string;
  status: string;
  scout_date: string | null;
  candidate_count: number | null;
  sent_count: number | null;
  failed_count: number | null;
  error_message: string | null;
}, names: string[]): PushMessage {
  const day = dateLabel(batch.scout_date);
  const url = "/recruit/estama-scout";
  if (batch.status === "pending_approval") {
    const preview = names.filter(Boolean).slice(0, 4).join("・");
    return {
      title: `📨 エステ魂スカウト：${day ? `${day}の` : ""}候補${batch.candidate_count ?? 0}人`,
      body: `この人たちにスカウトを送っていいですか？ タップして確認→OKで送信します${preview ? `\n${preview}${names.length > 4 ? " ほか" : ""}` : ""}`,
      url,
      tag: `estama-scout-${batch.id}`,
    };
  }
  if (batch.status === "done") {
    const failed = batch.failed_count ?? 0;
    return {
      title: `✅ エステ魂スカウトを${batch.sent_count ?? 0}人に送りました`,
      body: failed ? `${failed}人は送れなかった・確認できなかったので、画面で確認してください` : "今日の分は完了です",
      url,
      tag: `estama-scout-${batch.id}`,
    };
  }
  return {
    title: "⚠️ エステ魂スカウトが止まりました",
    body: clip(batch.error_message || "画面で状況を確認してください", 120),
    url,
    tag: `estama-scout-${batch.id}`,
  };
}

/** 日別精算の画面で、そのセラピストの清算明細（承認の画面）を開くURL */
export function settlementApprovalUrl(date: string | null, castId: string | null | undefined) {
  const params = new URLSearchParams();
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) params.set("date", date);
  if (castId) params.set("cast", castId);
  const query = params.toString();
  return query ? `/sales/daily-sales?${query}` : "/sales/daily-sales";
}

// セラピストがマイページから精算（その日の売上）を送ったとき。タップするとその人の清算明細が開き、金額を承認する
export function dailySalesMessage(record: {
  id: string;
  cast_id?: string | null;
  date: string | null;
  total_amount: number | null;
  cash_amount: number | null;
  card_amount: number | null;
  paypay_amount: number | null;
  customer_count: number | null;
  manual_adjustment: number | null;
  notes: string | null;
}, castName: string | null, resubmitted: boolean): PushMessage {
  const yen = (value: number | null) => `¥${Number(value ?? 0).toLocaleString("ja-JP")}`;
  const breakdown = [
    record.cash_amount ? `現金${yen(record.cash_amount)}` : "",
    record.card_amount ? `カード${yen(record.card_amount)}` : "",
    record.paypay_amount ? `PayPay${yen(record.paypay_amount)}` : "",
    record.manual_adjustment ? `調整${record.manual_adjustment > 0 ? "+" : "−"}${yen(Math.abs(record.manual_adjustment))}` : "",
  ].filter(Boolean).join(" / ");
  const lines = [
    [dateLabel(record.date), `${record.customer_count ?? 0}本`, `合計${yen(record.total_amount)}`].filter(Boolean).join(" "),
    breakdown,
    record.notes ? `メモ：${clip(record.notes, 60)}` : "",
    "タップして明細を確認・承認",
  ];
  return {
    title: `🧾 ${castName ? `${castName}さん` : "セラピスト"}が精算を${resubmitted ? "送り直しました" : "入力しました"}`,
    body: lines.filter(Boolean).join("\n"),
    url: settlementApprovalUrl(record.date, record.cast_id),
    tag: `daily-sales-${record.id}`,
  };
}

// 精算の不足分を、セラピストが「振込」で受け取ると選んだとき
export function settlementTransferMessage(approval: {
  clearance_id: string;
  cast_id: string;
  date: string | null;
  shortage_amount: number | null;
}, castName: string | null, account: {
  bank_name: string;
  branch_name: string;
  account_type: string;
  account_number: string;
  account_holder: string;
} | null): PushMessage {
  const amount = `¥${Number(approval.shortage_amount ?? 0).toLocaleString("ja-JP")}`;
  const where = account
    ? `振込先：${account.bank_name} ${account.branch_name} ${account.account_type} ＊＊＊${account.account_number.slice(-4)} ${account.account_holder}`
    : "振込先はマイページで入力してもらっています";
  return {
    title: `🏦 ${castName ? `${castName}さん` : "セラピスト"}が不足分${amount}の振込を希望しました`,
    body: [`${dateLabel(approval.date)}の精算`.replace(/^の/, ""), where].filter(Boolean).join("\n"),
    url: settlementApprovalUrl(approval.date, approval.cast_id),
    tag: `settlement-transfer-${approval.clearance_id}`,
  };
}

export function estamaLoginMessage(alert: { kind: string; message: string | null }): PushMessage {
  if (alert.kind === "automation_stopped") return {
    title: "⚠️ エステ魂の自動処理に確認が必要です",
    body: clip(alert.message ?? "自動化の稼働状況を確認してください", 160),
    url: "/staff", tag: "ZXN0YW1hLWF1dG9tYXRpb24",
  };
  const noCredentials = alert.kind === "no_credentials";
  return {
    title: noCredentials ? "⚠️ エステ魂のログインが切れています" : "⚠️ エステ魂に自動でログインし直せません",
    body: noCredentials
      ? "空き枠の更新・今すぐご案内・同期が止まっています。自動再ログイン用のメールアドレス・パスワードを登録してください"
      : clip(`3回続けて失敗しました。${alert.message ?? ""} パスワードを確かめて登録し直してください`, 120),
    url: "/staff?estama=login",
    tag: "estama-login",
  };
}

export function lineInboxMessage(input: { threadId: string; displayName: string | null; text: string; autoMinutes: number | null }): PushMessage {
  return {
    title: `💬 LINE：${input.displayName ? `${input.displayName}様` : "お客様"}`,
    body: clip(`${input.text || "（メッセージ）"}${input.autoMinutes ? `　※${input.autoMinutes}分返事が無ければ自動で一次対応します` : ""}`, 120),
    url: `/line-inbox?thread=${input.threadId}`,
    tag: `line-${input.threadId}`,
  };
}

export function lineInboxFailedMessage(thread: { id: string; display_name: string | null; error: string | null }): PushMessage {
  return {
    title: `⚠️ LINEの自動応答を送れませんでした`,
    body: clip(`${thread.display_name ? `${thread.display_name}様` : "お客様"}へ返事をしてください。${thread.error ?? ""}`, 120),
    url: `/line-inbox?thread=${thread.id}`,
    tag: `line-${thread.id}`,
  };
}

const ESTAMA_CHECK_TITLE: Record<string, string> = {
  dummy: "⚠️ ダミー宛て",
  unknown_cast: "⚠️ HPにいない名前",
  no_shift: "⚠️ HPに出勤なし",
  outside_shift: "⚠️ 出勤の時間外",
  overlap: "⚠️ 予約が重なる",
  course_limit: "⚠️ 新規のコース上限超え",
};

// エステ魂の仮予約が入ったとき（管理画面「お店への予約」を5分ごとに読み取り）
export function estamaReserveMessage(request: {
  id: string;
  hope_date: string | null;
  hope_time: string | null;
  nomination_label: string | null;
  is_free: boolean;
  course_minutes: number | null;
  customer_name: string | null;
  check_status: string;
  check_note: string | null;
}): PushMessage {
  const when = businessWhen(request.hope_date, request.hope_time);
  const what = [request.is_free ? "フリー" : request.nomination_label, request.course_minutes ? `${request.course_minutes}分` : ""].filter(Boolean).join(" ");
  const warn = ESTAMA_CHECK_TITLE[request.check_status];
  return {
    title: `📩 エステ魂の仮予約${warn ? `（${warn}）` : ""}`,
    body: [[when, what].filter(Boolean).join(" "), request.customer_name ? `${request.customer_name}様` : "", request.check_note ? clip(request.check_note, 80) : ""]
      .filter(Boolean).join("\n"),
    url: "/schedule-dashboard?tab=reservations&source=estama",
    tag: `estama-reserve-${request.id}`,
  };
}

export function subscriptionAlertMessage(alert: { id: string; level: string; message: string }, watchName: string): PushMessage {
  const stopped = alert.level === "stopped";
  return {
    title: stopped ? `🛑 ${watchName}の課金が止まっている可能性` : `⚠️ ${watchName}の支払いを確認してください`,
    body: clip(alert.message, 120),
    url: "/payments?tab=subscriptions",
    tag: `subscription-${alert.id}`,
  };
}

export function promotionTaskMessage(report: {
  id: string;
  plan_id: string;
  scheduled_on: string | null;
  task_label: string | null;
  plan_title: string | null;
}, castName: string | null): PushMessage {
  const who = castName?.trim() ? `${clip(castName, 40)}さん` : "セラピスト";
  return {
    title: `${who}が投稿しました`,
    body: clip([dateLabel(report.scheduled_on), report.task_label, report.plan_title].filter(Boolean).join(" / ") || "企画の投稿完了報告を確認してください", 120),
    url: `/promotion-schedule?tab=plans&plan=${encodeURIComponent(report.plan_id)}`,
    tag: `promotion-task-${report.id}`,
  };
}
