// 管理画面アプリへのプッシュ通知の文面。LINE通知と同じ内容を短くまとめる（ロック画面で読める長さ）。

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
}, castName: string | null): PushMessage {
  const when = [dateLabel(reservation.reservation_date), reservation.start_time ? `${reservation.start_time.slice(0, 5)}〜` : ""]
    .filter(Boolean)
    .join(" ");
  const course = [reservation.course_name, reservation.duration ? `${reservation.duration}分` : ""].filter(Boolean).join(" ");
  const who = [
    castName ? `${castName}${reservation.nomination_type && reservation.nomination_type !== "フリー" ? `（${reservation.nomination_type}）` : ""}` : "指名なし",
    reservation.customer_name ? `${reservation.customer_name}様` : "",
  ].filter(Boolean).join(" / ");
  const lines = [[when, course].filter(Boolean).join(" "), who];
  if (reservation.price) lines.push(`¥${Number(reservation.price).toLocaleString("ja-JP")}`);
  return {
    title: reservation.booking_origin === "cast_form" ? "🔔 セラピストの予約フォームから予約" : "🔔 WEB予約が入りました",
    body: lines.filter(Boolean).join("\n"),
    url: "/schedule/web-bookings",
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
    body: "この端末に通知が届きました。WEB予約・SMSの返信・SMS残高をお知らせします",
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
