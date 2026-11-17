import assert from "node:assert/strict";
import test from "node:test";

import {
  extractO2StorePostReferences,
  findO2StorePostForm,
  o2StoreFormError,
  o2StorePostPageMatches,
  o2StorePostReferenceFromUrl,
} from "../server/o2-store-post-page.ts";

// 2026-11 の新規投稿画面と同じ作り（値は架空）
const CREATE_HTML = `
<form action="/shop/post/create/" method="POST" id="postForm" enctype="multipart/form-data">
  <input type="hidden" name="csrf_token" value="dummy-token">
  <textarea name="content" id="content"></textarea>
  <button type="button">@ 女性を選択して挿入</button>
  <input type="file" name="image1" id="image1" accept="image/*">
  <input type="hidden" name="tpl_image1" id="tpl_image1" value="">
  <input type="file" name="image2" id="image2" accept="image/*">
  <input type="file" id="multiImageInput" accept="image/*">
  <input type="checkbox" name="is_recruitment" id="is_recruitment_check" value="1">
  <input type="radio" name="recruit_category" value="">
  <input type="datetime-local" name="scheduled_at" id="scheduled_at">
  <button type="submit">投稿する（1pt消費）</button>
</form>`;

test("公開の指定（status）が無い今の投稿フォームを見つける", () => {
  const found = findO2StorePostForm(CREATE_HTML, "https://m-sns.net/shop/post/create/");
  assert.ok(found);
  assert.equal(found.bodyField, "content");
  assert.equal(found.fileField, "image1");
  assert.equal(found.form.action, "https://m-sns.net/shop/post/create/");
});

test("投稿先が違う・画像欄が無いフォームは使わない", () => {
  assert.equal(findO2StorePostForm(CREATE_HTML.replace("/shop/post/create/", "/shop/search/"), "https://m-sns.net/shop/post/create/"), null);
  assert.equal(findO2StorePostForm(CREATE_HTML.replace(/<input type="file"[^>]*>/g, ""), "https://m-sns.net/shop/post/create/"), null);
});

test("一覧の編集リンクから投稿IDを取り、確認は編集画面で行う", () => {
  assert.deepEqual(o2StorePostReferenceFromUrl("https://m-sns.net/shop/post/edit/?id=1301856"), {
    id: "1301856",
    url: "https://m-sns.net/shop/post/edit/?id=1301856",
  });
  assert.equal(o2StorePostReferenceFromUrl("https://m-sns.net/shop/post/create/"), null);
  assert.equal(o2StorePostReferenceFromUrl("https://example.com/shop/post/edit/?id=1"), null);
  const html = `<a href="https://m-sns.net/shop/post/create/">新規</a>
    <a href="/shop/post/edit/?id=300">編集</a><a href="/shop/post/edit/?id=300&amp;x=1">同じ</a><a href="/shop/post/edit/?id=299">編集</a>`;
  assert.deepEqual(extractO2StorePostReferences(html, "https://m-sns.net/shop/post/").map((item) => item.id), ["300", "299"]);
});

test("編集画面の本文と画像で掲載を確かめる", () => {
  const body = "【本日満枠🈵】\n\n予約枠完売となりました🈵";
  const page = `<textarea name="content">${body}</textarea><img src="https://cdn.m-sns.net/shop/shop_1_1_abc.jpg">`;
  assert.equal(o2StorePostPageMatches(page, body), true);
  assert.equal(o2StorePostPageMatches(page.replace(/<img[^>]*>/, ""), body), false);
  assert.equal(o2StorePostPageMatches(`<textarea name="content">別の文</textarea><img src="https://cdn.m-sns.net/x.jpg">`, body), false);
  assert.equal(o2StorePostPageMatches(`<textarea name="content">${body}</textarea><input type="hidden" name="tpl_image1" value="abc.jpg">`, body), true);
});

test("受け付けられなかったときの理由を拾う", () => {
  assert.equal(o2StoreFormError(`<p class="text-red-500 text-sm">ポイントが不足しています</p>`), "ポイントが不足しています");
  assert.equal(o2StoreFormError(`<p class="text-gray-500">説明</p>`), null);
});
