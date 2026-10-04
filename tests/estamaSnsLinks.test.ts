import assert from "node:assert/strict";
import test from "node:test";

import { estamaBlogUrl, estamaXProfileUrl, normalizeO2Handle, normalizeXHandle } from "../server/estama-sns-links.ts";

test("X(旧Twitter)欄：SNS運用管理のXのプロフィールURLを https://x.com/ID の形で送る", () => {
  assert.equal(estamaXProfileUrl("https://x.com/enka_kirmai"), "https://x.com/enka_kirmai");
  assert.equal(estamaXProfileUrl("@enka_ichinose"), "https://x.com/enka_ichinose");
  assert.equal(estamaXProfileUrl("https://twitter.com/@rino_zenryoku"), "https://x.com/rino_zenryoku");
  assert.equal(estamaXProfileUrl("https://x.com/mirei_enka?s=21"), "https://x.com/mirei_enka");
  assert.equal(estamaXProfileUrl(null), "");
  assert.equal(estamaXProfileUrl("https://example.com/not-x/abc"), "");
  assert.equal(normalizeXHandle("  mirei_enka  "), "mirei_enka");
});

test("外部ブログ欄：O2のプロフィールURL。O2が無い人は今まで通りブログURL", () => {
  assert.equal(estamaBlogUrl("https://m-sns.net/profile/@enka_mai", ""), "https://m-sns.net/profile/@enka_mai");
  assert.equal(estamaBlogUrl("@noa_sendaii", "https://ameblo.jp/someone/"), "https://m-sns.net/profile/@noa_sendaii");
  assert.equal(estamaBlogUrl(null, "https://ameblo.jp/someone/"), "https://ameblo.jp/someone/");
  assert.equal(estamaBlogUrl(null, null), "");
  assert.equal(normalizeO2Handle("https://m-sns.net/profile/@enka1209/"), "enka1209");
});
