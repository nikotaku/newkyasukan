import { test } from "node:test";
import assert from "node:assert/strict";
import { bundlePathFromHtml, hasNewerBundle } from "../src/lib/appVersion.ts";

test("index.html から本体のファイルを取り出す", () => {
  const html = '<script async src="https://www.googletagmanager.com/gtag/js?id=G-1"></script><script type="module" crossorigin src="/assets/index-CeSAXtkD.js"></script><link rel="stylesheet" href="/assets/index-B1x_2.css">';
  assert.equal(bundlePathFromHtml(html), "/assets/index-CeSAXtkD.js");
  assert.equal(bundlePathFromHtml("<html></html>"), null);
});

test("本体のファイルが変わったときだけ新しい版がある", () => {
  assert.equal(hasNewerBundle("/assets/index-a.js", "/assets/index-b.js"), true);
  assert.equal(hasNewerBundle("/assets/index-a.js", "/assets/index-a.js"), false);
  assert.equal(hasNewerBundle(null, "/assets/index-b.js"), false, "開発中（読み込み元が分からない）は出さない");
  assert.equal(hasNewerBundle("/assets/index-a.js", null), false, "取れなかったときは出さない");
});
