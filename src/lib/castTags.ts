// 内部管理用のカテゴリタグ（在籍状況など）。公開フロント側には表示しない。
export const INTERNAL_CAST_TAGS = ["在籍", "出稼ぎ", "入店手続き待ち"] as const;

// 公開ページで表示するタグだけを返す（内部管理タグを除外）
export const getPublicCastTags = (tags: string[] | null | undefined): string[] =>
  (tags ?? []).filter((tag) => !INTERNAL_CAST_TAGS.includes(tag as (typeof INTERNAL_CAST_TAGS)[number]));
