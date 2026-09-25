// エステ魂の写メ日記画面の文言。2026-09-23に「写メ日記」が「写メNote」に改称され、
// 新規投稿ボタンが「Noteを書く」、公開一覧の見出しが「写メNote」になった。旧文言も残して両対応する。

export const ESTAMA_SOUL_DIARY_POST_URL = "https://estama.jp/tamathera/diary/post/";

// 「お礼Noteを書く」は別カテゴリ（お礼）の投稿画面なので除外して使う。
export const SOUL_DIARY_NEW_POST_TEXT = /Noteを書く|新規投稿|日記を書く|投稿する|新規作成/;
export const SOUL_DIARY_THANKS_POST_TEXT = /お礼/;

export const PUBLIC_DIARY_LIST_TEXT = /THERAPIST DIARY|THERAPIST NOTE|セラピスト写メ日記|写メ日記|写メNote/i;
