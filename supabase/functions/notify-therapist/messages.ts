// セラピストへの予約通知の文面（プッシュ通知と、移行中のLINEグループ用）。
// Deno（Edge Function）でも Node（テスト）でも動くよう、Deno 固有のAPIは使わない。

import {
  buildReservationLineMessage,
  formatBusinessDateLabel,
  formatPaymentMethod,
  formatPaymentStatus,
  formatReservationTimeRange,
  reservationDetailLines,
  type ReservationLineContext,
} from "../notify-line-therapist/reservationLineNotification.ts";

export type TherapistNotificationKind = "new" | "changed" | "cancelled" | "sns_ready" | "settlement" | "photo_review" | "notice";

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
  discount: number | null;
  payment_method: string | null;
  payment_details: { method?: string | null; amount?: number | null }[] | null;
  payment_status: string | null;
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
  if ("discount" in changes) {
    const yenLabel = (value: number | null | undefined) => `−${Math.max(0, Math.round(Number(value ?? 0))).toLocaleString("ja-JP")}円`;
    lines.push(`割引 ${yenLabel(changes.discount)} → ${yenLabel(context.discount)}`);
  }
  if ("payment_method" in changes || "payment_details" in changes) {
    const before = formatPaymentMethod({ payment_method: changes.payment_method ?? null, payment_details: changes.payment_details ?? null });
    lines.push(`決済方法 ${before} → ${formatPaymentMethod(context)}`);
  }
  if ("payment_status" in changes) {
    const before = formatPaymentStatus({ ...context, payment_status: changes.payment_status ?? null });
    lines.push(`決済状況 ${before} → ${formatPaymentStatus(context)}`);
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

  // 本文はLINEと同じ予約の中身（日時・開始時刻・コース・金額・割引・決済方法・決済状況・指名・ルーム…）
  const context = input.context!;
  const range = formatReservationTimeRange(context.start_time, context.duration, context.extension_minutes);
  const date = formatBusinessDateLabel(context.reservation_date, context.start_time);
  const detail = reservationDetailLines(context).join("\n");

  if (input.kind === "changed") {
    const changes = describeChanges(input.changes || {}, context);
    return {
      ...base,
      title: `✏️ 予約が変更されました ${date} ${range}`,
      body: [changes.map((line) => `・${line}`).join("\n"), "【変更後の予約内容】", detail].filter(Boolean).join("\n"),
    };
  }

  return {
    ...base,
    title: `🔔 新しい予約 ${date} ${range}`,
    body: detail,
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

/** お店が加工した写真の確認依頼。マイページの「写真の確認」を開く */
export function buildPhotoReviewPush(input: { portalUrl: string; count?: number; reviewId?: string }): TherapistPushMessage {
  const separator = input.portalUrl.includes("?") ? "&" : "?";
  return {
    title: "🖼 写真の確認をお願いします",
    body: `お店で加工した写真${input.count ? ` ${input.count}枚` : ""}を確認して、OKか直してほしい所を返事してください`,
    url: `${input.portalUrl}${separator}view=photo-review`,
    tag: `photo-review-${input.reviewId ?? "latest"}`,
    icon: ICON,
  };
}

export function buildPhotoReviewLineText(count?: number) {
  return [
    "🖼 写真の確認をお願いします",
    "",
    `お店で加工した写真${count ? ` ${count}枚` : ""}を、マイページの「写真の確認」で見て、写真ごとに「OK」か「直してほしい」で返事してください。`,
  ].join("\n") + "\n\n📲 マイページをホーム画面に追加して通知をオンにすると、お知らせがスマホに直接届きます";
}

/** お店からのお知らせ（掲示板）。マイページの「お知らせ」を開く */
export function buildNoticePush(input: { portalUrl: string; title?: string; important?: boolean; noticeId?: string }): TherapistPushMessage {
  const separator = input.portalUrl.includes("?") ? "&" : "?";
  return {
    title: input.important ? "⚠️ お店から大事なお知らせ" : "📢 お店からのお知らせ",
    body: `${input.title || "新しいお知らせがあります"}\nマイページの「お知らせ」で確認してください`,
    url: `${input.portalUrl}${separator}view=notices`,
    tag: `notice-${input.noticeId ?? "latest"}`,
    icon: ICON,
  };
}

export function buildNoticeLineText(input: { title?: string; body?: string; important?: boolean }) {
  return [
    input.important ? "⚠️ お店から大事なお知らせ" : "📢 お店からのお知らせ",
    "",
    input.title ? `【${input.title}】` : "",
    input.body ?? "",
  ].filter((line, i) => i < 2 || line).join("\n") + "\n\nマイページの「お知らせ」で「確認しました」を押してください";
}

// 精算の承認（承認した時点の金額。マイページでは最新の内容を出す）
export interface SettlementSnapshot {
  clearance_id?: string;
  date?: string;
  salary?: number;
  cash_sales?: number;
  shortage?: number;
  re_approved?: boolean;
  /** shortage_paid = お店が不足分を振り込んだ（「振込済みにする」） */
  event?: string;
}

const yen = (value: number | null | undefined) => `¥${Math.round(Number(value ?? 0)).toLocaleString("ja-JP")}`;

/** 精算の承認。タップするとマイページで明細と、不足分の受け取り方（振込・次回出勤日に相殺）を選ぶ画面が開く */
export function buildSettlementPush(input: { portalUrl: string; snapshot: SettlementSnapshot }): TherapistPushMessage {
  const snapshot = input.snapshot || {};
  const shortage = Math.max(0, Math.round(Number(snapshot.shortage ?? 0)));
  const date = snapshot.date ? formatBusinessDateLabel(snapshot.date, "12:00") : "";
  const separator = input.portalUrl.includes("?") ? "&" : "?";
  if (snapshot.event === "shortage_paid") {
    return {
      title: `💴 不足分 ${yen(shortage)} を振り込みました`,
      body: `${date ? `${date}の精算の` : ""}不足分 ${yen(shortage)} をお振込みしました。口座への入金をご確認ください`,
      url: snapshot.clearance_id ? `${input.portalUrl}${separator}settlement=${snapshot.clearance_id}` : input.portalUrl,
      tag: `shortage-paid-${snapshot.clearance_id ?? "latest"}`,
      icon: ICON,
    };
  }
  return {
    title: snapshot.re_approved
      ? "✏️ 精算の内容が直りました"
      : shortage > 0 ? "✅ 精算が承認されました（不足分があります）" : "✅ 精算が承認されました",
    body: [
      `${date ? `${date}の精算　` : ""}お給料 ${yen(snapshot.salary)}`,
      shortage > 0
        ? `不足分 ${yen(shortage)} は、振込もしくは次回出勤日の相殺になります。マイページで選んでください`
        : "明細はマイページで見られます",
    ].join("\n"),
    url: snapshot.clearance_id ? `${input.portalUrl}${separator}settlement=${snapshot.clearance_id}` : input.portalUrl,
    tag: `settlement-${snapshot.clearance_id ?? "latest"}`,
    icon: ICON,
  };
}

export function buildSettlementLineText(snapshot: SettlementSnapshot) {
  const shortage = Math.max(0, Math.round(Number(snapshot.shortage ?? 0)));
  const date = snapshot.date ? formatBusinessDateLabel(snapshot.date, "12:00") : "";
  if (snapshot.event === "shortage_paid") {
    return [
      `💴 不足分 ${yen(shortage)} を振り込みました`,
      "",
      `${date ? `${date}の精算の` : ""}不足分をお振込みしました。口座への入金をご確認ください`,
    ].join("\n") + "\n\n📲 マイページをホーム画面に追加して通知をオンにすると、お知らせがスマホに直接届きます";
  }
  return [
    snapshot.re_approved ? "✏️ 精算の内容が直りました" : "✅ 精算が承認されました",
    "",
    date ? `📅 ${date}` : "",
    `💰 お給料 ${yen(snapshot.salary)}`,
    shortage > 0 ? `\n不足分 ${yen(shortage)} は、振込もしくは次回出勤日の相殺になります。マイページの「精算」で受け取り方を選んでください（振込の方は振込先も入力できます）` : "",
    "明細はマイページで見られます",
  ].filter((line) => line !== "").join("\n") + "\n\n📲 マイページをホーム画面に追加して通知をオンにすると、お知らせがスマホに直接届きます";
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
    : input.kind === "settlement" ? "精算の承認"
    : input.kind === "photo_review" ? "写真の確認依頼"
    : "キャンセル";
  return {
    title: input.kind === "sns_ready"
      ? `⚠️ ${input.castName}さんにSNSのお知らせが届いていません`
      : input.kind === "photo_review"
      ? `⚠️ ${input.castName}さんに写真の確認依頼が届いていません`
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
