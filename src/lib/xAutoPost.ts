/**
 * 決まった形の投稿（出勤・空き枠・ピックアップ・イベント・口コミ）を、運用表の時間になったら X に自動で出すときの判断。
 * AI で作る投稿（kind: "ai"）は人が確認してから出すので対象外。Edge Function x-auto-post と画面の表示で使う。
 */
import { X_MAX_WEIGHT, xWeightedLength, type XDailyPost, type XPostKind } from "./xDailyPosts.ts";

export const AUTO_POST_KINDS: ReadonlySet<XPostKind> = new Set<XPostKind>([
  "today_shift",
  "tomorrow_shift",
  "slots",
  "pickup",
  "event",
  "last_slot",
  "review",
]);

// 予定の時間からこれ以上遅れたら出さない（「本日の出勤」を夜に出すなど、ずれた投稿を防ぐ）
export const AUTO_POST_LATE_LIMIT_MINUTES = 30;
// 失敗したときに出し直す回数の上限（最初の1回を含む）
export const AUTO_POST_MAX_ATTEMPTS = 2;

export interface SavedXPost {
  text: string | null;
  text_source: "ai" | "edited" | null;
  posted_at: string | null;
  publish_status: string | null;
  attempts: number | null;
}

// post: 今出す / wait: まだ時間前 / done: 済み（投稿済み・見送り確定・出し直し上限）
// missed: 時間を過ぎたので出さない（理由を残す） / skip: 今は出せない（理由を残し、時間内なら次の回にまた判断する）
export type AutoPostAction = "post" | "wait" | "done" | "missed" | "skip";

export interface AutoPostDecision {
  post: XDailyPost;
  action: AutoPostAction;
  text: string;
  reason: string | null;
}

/** 営業日（朝6時切り替え）の中の分。0:00〜5:59 は前日の続き（24:00〜29:59）として数える */
export function businessMinutes(time: string): number | null {
  const match = time.match(/(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  return minutes < 6 * 60 ? minutes + 24 * 60 : minutes;
}

export function isAutoPostKind(kind: XPostKind) {
  return AUTO_POST_KINDS.has(kind);
}

/** その投稿を今出すかどうか。nowMinutes は日本時間の 0〜1439 の分 */
export function decideAutoPost(post: XDailyPost, saved: SavedXPost | undefined, nowMinutes: number): AutoPostDecision {
  const text = (saved?.text_source === "edited" && saved.text ? saved.text : post.text).trim();
  const decision = (action: AutoPostAction, reason: string | null = null): AutoPostDecision => ({ post, action, text, reason });

  if (saved?.posted_at || saved?.publish_status === "posted" || saved?.publish_status === "posting") return decision("done");
  if (!isAutoPostKind(post.kind)) return decision("skip", "AIで作る投稿は確認してから手動で投稿します");

  const slot = businessMinutes(post.time);
  if (slot === null) return decision("skip", "運用表の時間が読み取れません");
  const now = nowMinutes < 6 * 60 ? nowMinutes + 24 * 60 : nowMinutes;
  if (now < slot) return decision("wait");
  if (now - slot > AUTO_POST_LATE_LIMIT_MINUTES) {
    // 見送り・失敗の理由がもう残っていればそのまま。何も残っていなければ「時間を過ぎた」を残す
    if (saved?.publish_status === "skipped" || saved?.publish_status === "failed") return decision("done");
    return decision("missed", `予定の${post.time}から${AUTO_POST_LATE_LIMIT_MINUTES}分以上過ぎたので出しませんでした`);
  }

  if (saved?.publish_status === "failed" && (saved.attempts ?? 0) >= AUTO_POST_MAX_ATTEMPTS) return decision("done");
  if (post.warning) return decision("skip", post.warning);
  if (!text) return decision("skip", "投稿文を作れませんでした");
  if (xWeightedLength(text) > X_MAX_WEIGHT) return decision("skip", `${X_MAX_WEIGHT}文字（全角は2文字分）を超えています`);
  return decision("post");
}
