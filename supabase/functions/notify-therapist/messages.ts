// セラピストへの予約通知の文面（プッシュ通知と、移行中のLINEグループ用）。
// Deno（Edge Function）でも Node（テスト）でも動くよう、Deno 固有のAPIは使わない。

import {
  buildReservationLineMessage,
  formatBusinessDateLabel,
  formatReservationTimeRange,
  type ReservationLineContext,
} from "../notify-line-therapist/reservationLineNotification.ts";

export type TherapistNotificationKind = "new" | "changed" | "cancelled" | "sns_ready";

export interface TherapistPushMessage {
  title: string;
  body: string;
  url: string;
  tag: string;
  icon?: string;
}

export interface CancelledSnapshot {
  reservation_date?: string | null;
  start_time?: string | null;
  duration?: number | null;
  course_name?: string | null;
  room?: string | null;
  customer_name?: string | null;
  reason?: string | null;
}

// 変更前の値（変わった項目だけ）
export type ReservationChanges = Partial<{
  reservation_date: string | null;
  start_time: string | null;
  duration: number | null;
  course_name: string | null;
  room: string | null;
  options: string[] | null;
  customer_name: string | null;
}>;

const ICON = "/therapist-app/icon-192.png";

const hhmm = (value: string | null | undefined) => (value || "").slice(0, 5);

function whenLabel(date: string | null | undefined, start: string | null | undefined) {
  if (!date) return "";
  const label = formatBusinessDateLabel(date, start || "12:00");
  if (!start) return label;
  const [hour, minute] = hhmm(start).split(":").map(Number);
  const displayHour = Number.isFinite(hour) && hour < 6 ? hour + 24 : hour;
  return `${label} ${String(displayHour).padStart(2, "0")}:${String(minute || 0).padStart(2, "0")}〜`;
}

function courseLabel(course: string | null | undefined, duration: number | null | undefined) {
  const name = course?.trim() || "コース未設定";
  if (!duration || name.includes(`${duration}分`)) return name;
  return `${name} ${duration}分`;
}

/** 変更点を「開始 20:00→20:30」のように並べる */
export function describeChanges(changes: ReservationChanges, context: ReservationLineContext): string[] {
  const lines: string[] = [];
  if ("reservation_date" in changes || "start_time" in changes) {
    const before = whenLabel(changes.reservation_date ?? context.reservation_date, changes.start_time ?? context.start_time);
    const after = whenLabel(context.reservation_date, context.start_time);
    lines.push(`日時 ${before.replace(/〜$/, "")} → ${after.replace(/〜$/, "")}`);
  }
  if ("course_name" in changes || "duration" in changes) {
    const before = courseLabel(changes.course_name ?? context.course_name, changes.duration ?? context.duration);
    lines.push(`コース ${before} → ${courseLabel(context.course_name, context.duration)}`);
  }
  if ("room" in changes) {
    lines.push(`ルーム ${changes.room?.trim() || "未定"} → ${context.room?.trim() || "未定"}`);
  }
  if ("options" in changes) {
    const before = (changes.options ?? []).join("、") || "なし";
    const after = (context.options ?? []).join("、") || "なし";
    lines.push(`オプション ${before} → ${after}`);
  }
  if ("customer_name" in changes) {
    lines.push(`お名前 ${changes.customer_name || "-"} 様 → ${context.customer_name} 様`);
  }
  return lines;
}

export function buildTherapistPush(input: {
  kind: TherapistNotificationKind;
  portalUrl: string;
  notificationId: string;
  reservationId: string | null;
  context?: ReservationLineContext | null;
  changes?: ReservationChanges;
  snapshot?: CancelledSnapshot;
}): TherapistPushMessage {
  const tag = `reservation-${input.reservationId || input.notificationId}`;
  const base = { url: input.portalUrl, tag, icon: ICON };

  if (input.kind === "cancelled") {
    const snapshot = input.snapshot || {};
    const when = whenLabel(snapshot.reservation_date, snapshot.start_time);
    const castChanged = snapshot.reason === "cast_changed";
    return {
      ...base,
      title: castChanged ? "🔁 担当が変わりました" : "❌ 予約がキャンセルされました",
      body: [
        when,
        [courseLabel(snapshot.course_name, snapshot.duration), snapshot.customer_name ? `${snapshot.customer_name}様` : ""].filter(Boolean).join(" / "),
        castChanged ? "この予約は別のセラピストが担当します" : "",
      ].filter(Boolean).join("\n"),
    };
  }

  const context = input.context!;
  const range = formatReservationTimeRange(context.start_time, context.duration, context.extension_minutes);
  const date = formatBusinessDateLabel(context.reservation_date, context.start_time);
  const detail = [courseLabel(context.course_name, context.duration), `${context.customer_name}様`, context.room?.trim()]
    .filter(Boolean)
    .join(" / ");

  if (input.kind === "changed") {
    const changes = describeChanges(input.changes || {}, context);
    return {
      ...base,
      title: `✏️ 予約が変更されました ${date} ${range}`,
      body: [changes.join("\n"), detail].filter(Boolean).join("\n"),
    };
  }

  const nomination = context.nomination_type?.trim();
  return {
    ...base,
    title: `🔔 新しい予約 ${date} ${range}`,
    body: [detail, nomination && nomination !== "none" ? nomination : "フリー"].filter(Boolean).join("\n"),
  };
}

/** SNSアカウント（X・O2）の準備ができたお知らせ。マイページの「SNSアカウント」を開く */
export function buildSnsReadyPush(input: { portalUrl: string; castId: string }): TherapistPushMessage {
  const separator = input.portalUrl.includes("?") ? "&" : "?";
  return {
    title: "📱 XとO2のアカウントの準備ができました",
    body: "マイページでログインIDとパスワードを確認して、アイコン・トップ画像・自己紹介・初回ポストを設定してください",
    url: `${input.portalUrl}${separator}view=sns`,
    tag: `sns-ready-${input.castId}`,
    icon: ICON,
  };
}

export function buildSnsReadyLineText() {
  return [
    "📱 XとO2のアカウントの準備ができました",
    "",
    "マイページの「SNSアカウント」に、ログインIDとパスワード・設定マニュアルがあります。",
    "① Xのトップ（アイコン・ヘッダー・名前）",
    "② O2のトップ",
    "③ 自己紹介（BIO）",
    "④ 初回ポスト",
    "の順に設定してください。",
  ].join("\n") + "\n\n📲 マイページをホーム画面に追加して通知をオンにすると、お知らせがスマホに直接届きます";
}

/** LINEグループ用（マイページの通知をまだ設定していないセラピストだけ） */
export function buildTherapistLineText(input: {
  kind: TherapistNotificationKind;
  context?: ReservationLineContext | null;
  changes?: ReservationChanges;
  snapshot?: CancelledSnapshot;
}): string {
  const footer = "\n\n📲 マイページをホーム画面に追加して通知をオンにすると、予約のお知らせがスマホに直接届きます";
  if (input.kind === "cancelled") {
    const snapshot = input.snapshot || {};
    const castChanged = snapshot.reason === "cast_changed";
    return [
      castChanged ? "🔁 担当変更のお知らせ" : "❌ 予約キャンセルのお知らせ",
      "",
      `📅 ${whenLabel(snapshot.reservation_date, snapshot.start_time)}`,
      `💆 ${courseLabel(snapshot.course_name, snapshot.duration)}`,
      snapshot.room ? `🏠 ルーム：${snapshot.room}` : "",
      snapshot.customer_name ? `お客様：${snapshot.customer_name} 様` : "",
      castChanged ? "\nこの予約は別のセラピストが担当します" : "",
    ].filter((line) => line !== "").join("\n") + footer;
  }
  const context = input.context!;
  const message = buildReservationLineMessage(context);
  if (input.kind === "changed") {
    const changes = describeChanges(input.changes || {}, context);
    return [
      "✏️ 予約変更のお知らせ",
      ...changes.map((line) => `・${line}`),
      "",
      message.replace(/^🔔 新規予約のご案内\n/, "【変更後の予約内容】\n"),
    ].join("\n") + footer;
  }
  return message + footer;
}

export function unreachableAdminMessage(input: {
  castName: string;
  kind: TherapistNotificationKind;
  when: string;
  reason: "no_device" | "failed";
  notificationId: string;
}) {
  const kindLabel = input.kind === "new" ? "新しい予約"
    : input.kind === "changed" ? "予約の変更"
    : input.kind === "sns_ready" ? "SNSアカウント準備完了のお知らせ"
    : "キャンセル";
  return {
    title: input.kind === "sns_ready"
      ? `⚠️ ${input.castName}さんにSNSのお知らせが届いていません`
      : `⚠️ ${input.castName}さんに予約通知が届いていません`,
    body: `${input.when ? `${input.when} の` : ""}${kindLabel}。${
      input.reason === "no_device"
        ? "マイページのスマホ通知が未設定です。直接連絡してください"
        : "送信に失敗しました。直接連絡してください"
    }`,
    url: "/admin-schedule",
    tag: `therapist-notify-${input.notificationId}`,
  };
}

export { whenLabel };
