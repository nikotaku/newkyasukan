// 加工した写真のセラピスト確認（スタッフ画面の写真タブ → マイページ）

export type PhotoReviewAnswer = "ok" | "change";

export type PhotoReviewItem = { url: string; answer: PhotoReviewAnswer | null; note: string | null };

export type PhotoReviewStatus = "pending" | "approved" | "changes_requested" | "cancelled";

export type PhotoReview = {
  id: string;
  photos: PhotoReviewItem[];
  message: string | null;
  status: PhotoReviewStatus;
  response_note: string | null;
  requested_at: string;
  responded_at: string | null;
};

export const PHOTO_REVIEW_STATUS_LABELS: Record<PhotoReviewStatus, string> = {
  pending: "確認待ち",
  approved: "OK",
  changes_requested: "直してほしい",
  cancelled: "取り消し",
};
