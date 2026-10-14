// サブスクの見張り（支払い管理の「サブスクの見張り」）：登録したサブスクごとに「課金が止まっていないか」を判定する。
// 判定する材料：
//   - サービスに直接たずねた結果（Twilio のアカウントの状態・SUBLINE のAPI・URLが開けるか・エステ魂の契約期間 など）
//   - メール（Gmail の取り込み）：支払いの失敗・利用停止の知らせ／領収書・請求の知らせ
//   - 使われている形跡（IVRy の着信通知がしばらく届いていない など）
//   - 日付：次の請求日を過ぎても支払いを確認できていない・登録カードの有効期限
// 画面（PaymentManagement）と Edge Function subscription-check で同じ判定を使う。テスト: npm run test:subscription-watch

export type WatchLevel = "ok" | "warning" | "stopped" | "unknown";

export type WatchService =
  | "supabase"
  | "ivry"
  | "subline"
  | "twilio"
  | "estama"
  | "vercel"
  | "browserbase"
  | "anthropic"
  | "line"
  | "domain"
  | "other";

export interface ServicePreset {
  key: WatchService;
  label: string;
  /** 請求・停止のメールの送り元（ドメインの一部）。メールの取り込みで使う */
  senders: string[];
  /** 自動でたずねる方法の説明（画面用） */
  autoCheck: string;
  /** 管理画面（支払い方法を確かめる場所） */
  manageUrl?: string;
}

export const SERVICE_PRESETS: ServicePreset[] = [
  { key: "supabase", label: "Supabase（データベース）", senders: ["supabase.com", "supabase.io"], autoCheck: "1時間ごとに動いていることを記録（止まるとこの画面も開けなくなります）＋請求・停止のメール", manageUrl: "https://supabase.com/dashboard/org/_/billing" },
  { key: "ivry", label: "IVRy（電話の自動応答）", senders: ["ivry.jp", "ivr.co.jp"], autoCheck: "着信通知のメールが届き続けているか＋請求・停止のメール", manageUrl: "https://ivry.jp/" },
  { key: "subline", label: "SUBLINE（050番号）", senders: ["subline.jp", "interpark.co.jp"], autoCheck: "SUBLINEのAPIに接続できるか（電話設定のトークン）＋請求・停止のメール", manageUrl: "https://subline.jp/" },
  { key: "twilio", label: "Twilio（SMS）", senders: ["twilio.com"], autoCheck: "Twilioのアカウントが有効か（停止・凍結）＋請求・停止のメール", manageUrl: "https://console.twilio.com/us1/billing/manage-billing/billing-overview" },
  { key: "estama", label: "エステ魂（掲載プラン）", senders: ["estama.jp"], autoCheck: "管理画面の「ご契約期間」（仮予約の取り込みのたびに読む）", manageUrl: "https://estama.jp/admin/ac/" },
  { key: "vercel", label: "Vercel（HPの公開）", senders: ["vercel.com"], autoCheck: "HPが開けるか（URL）＋請求・停止のメール", manageUrl: "https://vercel.com/dashboard" },
  { key: "browserbase", label: "Browserbase（エステ魂の自動操作）", senders: ["browserbase.com"], autoCheck: "請求・停止のメール", manageUrl: "https://www.browserbase.com/" },
  { key: "anthropic", label: "Anthropic（LINEのAI応答）", senders: ["anthropic.com"], autoCheck: "請求・停止のメール", manageUrl: "https://console.anthropic.com/settings/billing" },
  { key: "line", label: "LINE公式アカウント", senders: ["linecorp.com", "line.me", "lycorp.co.jp"], autoCheck: "請求・停止のメール", manageUrl: "https://manager.line.biz/" },
  { key: "domain", label: "ドメイン（enka-salon.jp など）", senders: [], autoCheck: "サイトが開けるか（URL）・更新日", },
  { key: "other", label: "その他", senders: [], autoCheck: "請求日・カードの有効期限（URLを入れれば開けるかも確認）" },
];

export const presetFor = (service: string | null | undefined) =>
  SERVICE_PRESETS.find((preset) => preset.key === service) ?? SERVICE_PRESETS[SERVICE_PRESETS.length - 1];

// ---------- メールの見分け ----------

export type BillingMailKind = "billing_failed" | "billing_paid" | null;

const FAILED = /(支払(?:い)?(?:に|が)?(?:失敗|できませんでした|確認できません)|決済(?:に)?(?:失敗|エラー|できません)|お支払い.{0,8}(?:失敗|エラー|未完了|確認できません)|未払い|未納|滞納|利用(?:を)?停止|サービス(?:を)?停止|停止(?:予定|いたします|しました|されます)|一時停止|アカウント.{0,6}(?:停止|凍結|制限)|有効期限切れ|カード.{0,10}(?:エラー|拒否|無効|更新して)|payment (?:failed|declined|unsuccessful|issue|problem)|failed payment|past[- ]due|overdue|unpaid|suspend|paused|will be paused|deactivat|card (?:declined|expired|expiring)|update your (?:payment|billing|card)|action required)/i;
const PAID = /(領収書|領収証|お支払い(?:が)?(?:完了|ありがとう|を確認)|ご請求(?:書|額|金額)|請求書|ご利用料金|決済(?:が)?完了|receipt|invoice|payment (?:received|successful|confirmation)|thank(?:s| you) for your payment|your (?:bill|invoice))/i;

/** 請求まわりのメールか（件名・本文の始め）。停止の知らせを領収書より優先する */
export function classifyBillingMail(subject: string, body = ""): BillingMailKind {
  const text = `${subject}\n${body.slice(0, 1500)}`;
  if (FAILED.test(text)) return "billing_failed";
  if (PAID.test(text)) return "billing_paid";
  return null;
}

/** メールの送り元がそのサブスクのものか（プリセットの送り元＋登録した送り元・件名のキーワード） */
export function mailMatchesWatch(
  mail: { sender: string | null; subject: string },
  watch: { service: string; mail_keywords?: string[] | null },
) {
  const sender = (mail.sender ?? "").toLowerCase();
  const domains = presetFor(watch.service).senders;
  if (domains.some((domain) => sender.includes(domain))) return true;
  const keywords = (watch.mail_keywords ?? []).map((keyword) => keyword.trim().toLowerCase()).filter(Boolean);
  const haystack = `${sender}\n${mail.subject.toLowerCase()}`;
  return keywords.some((keyword) => haystack.includes(keyword));
}

// ---------- 日付 ----------

const DAY = 86_400_000;
const toDay = (value: string) => new Date(`${value.slice(0, 10)}T00:00:00+09:00`).getTime();

/** 次の請求日を1周期すすめる（月額は翌月の同じ日。月末は月末に寄せる） */
export function nextBillingAfter(date: string, cycle: "monthly" | "yearly" | string) {
  const [year, month, day] = date.slice(0, 10).split("-").map(Number);
  const addMonths = cycle === "yearly" ? 12 : 1;
  const target = new Date(Date.UTC(year, month - 1 + addMonths, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.toISOString().slice(0, 10);
}

/** カードの有効期限（YYYY-MM）の月末まで何日か。読めなければ null */
export function daysUntilCardExpiry(cardExpiry: string | null | undefined, now: Date) {
  const match = (cardExpiry ?? "").match(/^(\d{4})-(\d{1,2})$/);
  if (!match) return null;
  // 有効期限の月の翌月1日 0:00（日本時間）
  const end = Date.UTC(Number(match[1]), Number(match[2]), 1) - 9 * 3_600_000;
  return Math.floor((end - now.getTime()) / DAY);
}

// ---------- 判定 ----------

export interface WatchInput {
  service: string;
  next_billing_date?: string | null;
  card_expiry?: string | null;
  /** 最後に「支払いを確認」した日・領収書のメールが届いた日時 */
  last_paid_at?: string | null;
  /** 使われている形跡が無ければ止まっている疑い：何日まで待つか（IVRy の着信通知など） */
  silence_days?: number | null;
}

export interface WatchSignals {
  /** サービスに直接たずねた結果。null はたずねていない */
  probe?: { level: WatchLevel; message: string } | null;
  /** 直近の停止・失敗のメール（領収書より新しいもの） */
  failedMail?: { subject: string; received_at: string } | null;
  /** 直近の領収書・請求のメール */
  paidMail?: { subject: string; received_at: string } | null;
  /** 使われている形跡の最後（IVRy なら最後の着信通知）。null は分からない */
  lastActivityAt?: string | null;
  /** 形跡を見ている（Gmail の取り込みが動いている）か */
  activityTracked?: boolean;
}

export interface WatchResult {
  level: WatchLevel;
  reasons: string[];
}

const LEVEL_ORDER: Record<WatchLevel, number> = { ok: 0, unknown: 1, warning: 2, stopped: 3 };
export const worseLevel = (a: WatchLevel, b: WatchLevel) => (LEVEL_ORDER[a] >= LEVEL_ORDER[b] ? a : b);
export const isWorse = (next: WatchLevel, previous: WatchLevel | null | undefined) =>
  LEVEL_ORDER[next] > LEVEL_ORDER[previous ?? "ok"] && (next === "warning" || next === "stopped");

const md = (iso: string) => {
  const d = new Date(new Date(iso).getTime() + 9 * 3_600_000);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
};

export function evaluateWatch(watch: WatchInput, signals: WatchSignals, now = new Date()): WatchResult {
  let level: WatchLevel = "ok";
  const reasons: string[] = [];
  const raise = (next: WatchLevel, reason: string) => {
    level = worseLevel(level, next);
    reasons.push(reason);
  };

  if (signals.probe) {
    if (signals.probe.level === "ok") reasons.push(signals.probe.message);
    else raise(signals.probe.level, signals.probe.message);
  }

  const failed = signals.failedMail;
  const paid = signals.paidMail;
  if (failed && (!paid || new Date(failed.received_at) > new Date(paid.received_at))
    && now.getTime() - new Date(failed.received_at).getTime() < 30 * DAY) {
    raise("stopped", `${md(failed.received_at)} に支払い失敗・停止のメール：「${failed.subject.slice(0, 40)}」`);
  }

  // 次の請求日を過ぎても、その日以降の支払いが確認できない
  if (watch.next_billing_date) {
    const due = toDay(watch.next_billing_date);
    const paidAt = [watch.last_paid_at, paid?.received_at].filter(Boolean).map((value) => new Date(value!).getTime());
    const paidAfterDue = paidAt.some((time) => time >= due - 3 * DAY);
    const overdueDays = Math.floor((now.getTime() - due) / DAY);
    if (overdueDays >= 3 && !paidAfterDue) {
      raise("warning", `請求日（${watch.next_billing_date.slice(5).replace("-", "/")}）を${overdueDays}日過ぎても支払いを確認できていません`);
    }
  }

  const cardDays = daysUntilCardExpiry(watch.card_expiry, now);
  if (cardDays !== null) {
    if (cardDays < 0) raise("stopped", "登録カードの有効期限が切れています（次の請求で止まります）");
    else if (cardDays <= 30) raise("warning", `登録カードの有効期限まであと${cardDays}日です`);
  }

  const activityWatched = Boolean(watch.silence_days && signals.activityTracked);
  if (activityWatched) {
    if (!signals.lastActivityAt) {
      raise("warning", "使われている形跡（通知のメールなど）がまだ届いていません");
    } else {
      const silent = Math.floor((now.getTime() - new Date(signals.lastActivityAt).getTime()) / DAY);
      if (silent >= watch.silence_days!) raise("warning", `${silent}日間、通知が届いていません（止まっていないか確認してください）`);
      else reasons.push(`通知メールが届いています（最後 ${md(signals.lastActivityAt)}）`);
    }
  }

  if (level === "ok" && !signals.probe && !paid && !watch.next_billing_date && !watch.card_expiry && !activityWatched) {
    return {
      level: "unknown",
      reasons: [watch.silence_days
        ? "通知メールの取り込み（Gmail）が動いていないため、届いているか確かめられません（請求日・カードの有効期限を入れれば日付でも見張ります）"
        : "自動で確かめる材料がありません（請求日・カードの有効期限を入れてください）"],
    };
  }
  return { level, reasons };
}
