import assert from "node:assert/strict";
import test from "node:test";

import {
  ESTAMA_SOUL_DIARY_POST_URL,
  PUBLIC_DIARY_LIST_TEXT,
  SOUL_DIARY_NEW_POST_TEXT,
  SOUL_DIARY_THANKS_POST_TEXT,
} from "../server/estama-diary-wording.ts";

const isNewPostAction = (text: string) => SOUL_DIARY_NEW_POST_TEXT.test(text) && !SOUL_DIARY_THANKS_POST_TEXT.test(text);

test("写メNoteへの改称後の新規投稿ボタンを見つける", () => {
  assert.equal(isNewPostAction("Noteを書く"), true);
  assert.equal(isNewPostAction("新規投稿"), true);
  assert.equal(isNewPostAction("日記を書く"), true);
});

test("お礼Noteの投稿ボタンは通常の新規投稿として扱わない", () => {
  assert.equal(isNewPostAction("お礼Noteを書く"), false);
  assert.equal(isNewPostAction("Noteを編集"), false);
});

test("公開一覧は改称後の見出しでも読み込めたと判断する", () => {
  assert.equal(PUBLIC_DIARY_LIST_TEXT.test("写メNote 艶華 1〜20件を表示"), true);
  assert.equal(PUBLIC_DIARY_LIST_TEXT.test("THERAPIST DIARY"), true);
  assert.equal(PUBLIC_DIARY_LIST_TEXT.test("ページが見つかりません"), false);
});

test("投稿画面は魂セラピストの写メNote新規投稿URL", () => {
  const url = new URL(ESTAMA_SOUL_DIARY_POST_URL);
  assert.equal(url.hostname, "estama.jp");
  assert.equal(url.pathname, "/tamathera/diary/post/");
});
