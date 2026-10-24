// お店からセラピストへのお知らせ（掲示板）。管理画面（/therapist-notices）とマイページ（?view=notices）で使う

export type NoticeImportance = "normal" | "important";

export interface TherapistNotice {
  id: string;
  title: string;
  body: string;
  importance: NoticeImportance;
  target_cast_ids: string[] | null;
  pinned: boolean;
  expires_at: string | null;
  created_at: string;
  deleted_at?: string | null;
}

/** マイページで見るお知らせ（本人が「確認しました」を押したか） */
export interface PortalNotice {
  id: string;
  title: string;
  body: string;
  importance: NoticeImportance;
  pinned: boolean;
  created_at: string;
  read_at: string | null;
}

export interface NoticeCast {
  id: string;
  name: string;
}

/** よく出すお知らせのひな形（押すとタイトル・本文が入る。あとは手直し） */
export const NOTICE_TEMPLATES: { label: string; title: string; body: string; importance: NoticeImportance }[] = [
  {
    label: "清掃のお願い",
    title: "ルームの清掃について",
    body: "最近、清掃が行き届いていないところがありました。\n・シーツ・タオルの交換\n・床の髪の毛\n・洗面台・シャワー室の水滴\n・ゴミの回収\n施術後は次の方が気持ちよく使えるよう、チェックをお願いします。",
    importance: "important",
  },
  {
    label: "シフト提出のお願い",
    title: "シフトの提出をお願いします",
    body: "ルームが増えるため、出勤できる日を増やせます。\nマイページの「シフト提出」から、来月の出勤できる日を提出してください。",
    importance: "normal",
  },
  {
    label: "ルール・注意",
    title: "",
    body: "",
    importance: "important",
  },
];

/** このお知らせの宛先（空なら全員） */
export function noticeTargets<C extends NoticeCast>(notice: Pick<TherapistNotice, "target_cast_ids">, casts: C[]): C[] {
  if (!notice.target_cast_ids || notice.target_cast_ids.length === 0) return casts;
  const ids = new Set(notice.target_cast_ids);
  return casts.filter((cast) => ids.has(cast.id));
}

/** 確認した人・まだの人 */
export function readSummary<C extends NoticeCast>(
  notice: Pick<TherapistNotice, "id" | "target_cast_ids">,
  casts: C[],
  reads: { notice_id: string; cast_id: string }[],
) {
  const readIds = new Set(reads.filter((r) => r.notice_id === notice.id).map((r) => r.cast_id));
  const targets = noticeTargets(notice, casts);
  const read = targets.filter((cast) => readIds.has(cast.id));
  const unread = targets.filter((cast) => !readIds.has(cast.id));
  return { total: targets.length, read, unread };
}

/** マイページ：まだ「確認しました」を押していないお知らせの数 */
export function unreadCount(notices: Pick<PortalNotice, "read_at">[]) {
  return notices.filter((notice) => !notice.read_at).length;
}

/** 掲載期限（日付だけ選ぶ）→ その日の終わり（日本時間 23:59:59） */
export function expiresAtFromDate(date: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return `${date}T23:59:59+09:00`;
}
