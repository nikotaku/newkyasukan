import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createLinkBanner,
  hostLabel,
  normalizeLinkBanners,
  ownLinkBannerHtml,
  safeHttpUrl,
  visibleLinkBanners,
} from "../src/lib/linkBanners.ts";

test("http(s) 以外のURLはリンクにしない", () => {
  assert.equal(safeHttpUrl("javascript:alert(1)"), "");
  assert.equal(safeHttpUrl("data:text/html,hi"), "");
  assert.equal(safeHttpUrl("//example.com"), "");
  assert.equal(safeHttpUrl(" https://example.com/a "), "https://example.com/a");
  assert.equal(safeHttpUrl(123), "");
});

test("保存されている値をそろえる（リンク先の無いもの・おかしな値は捨てる）", () => {
  const list = normalizeLinkBanners([
    { id: "a", name: " メンエスランキング ", url: "https://rank.example.jp/", image_url: "https://rank.example.jp/b.png" },
    { id: "b", name: "悪いリンク", url: "javascript:alert(1)" },
    { id: "c", url: "https://www.portal.example.com/shop", image_url: "javascript:x", enabled: false },
    null,
    "x",
  ]);
  assert.equal(list.length, 2);
  assert.deepEqual(list[0], {
    id: "a",
    name: "メンエスランキング",
    url: "https://rank.example.jp/",
    image_url: "https://rank.example.jp/b.png",
    enabled: true,
  });
  assert.equal(list[1].name, "portal.example.com", "名前が無ければドメイン名");
  assert.equal(list[1].image_url, "", "画像のURLもhttp(s)だけ");
  assert.equal(list[1].enabled, false);
  assert.deepEqual(normalizeLinkBanners(undefined), []);
});

test("同じIDが重なったら付け直す", () => {
  const list = normalizeLinkBanners([
    { id: "a", url: "https://a.example/" },
    { id: "a", url: "https://b.example/" },
  ]);
  assert.equal(list.length, 2);
  assert.notEqual(list[0].id, list[1].id);
});

test("HPには表示オンのものだけを並び順のまま出す", () => {
  const list = visibleLinkBanners([
    { id: "1", url: "https://a.example/", enabled: false },
    { id: "2", url: "https://b.example/" },
    { id: "3", url: "https://c.example/" },
  ]);
  assert.deepEqual(list.map((b) => b.id), ["2", "3"]);
});

test("新しく足すときはリンク先が必須、画像は空でもよい", () => {
  assert.equal(typeof createLinkBanner({ name: "x", url: "", image_url: "" }), "string");
  assert.equal(typeof createLinkBanner({ name: "x", url: "https://a.example/", image_url: "ftp://x" }), "string");
  const ok = createLinkBanner({ name: "", url: "https://www.a.example/", image_url: "" });
  assert.equal(typeof ok, "object");
  if (typeof ok === "object") {
    assert.equal(ok.name, "a.example");
    assert.equal(ok.image_url, "");
    assert.equal(ok.enabled, true);
  }
});

test("ドメイン名", () => {
  assert.equal(hostLabel("https://www.example.co.jp/path"), "example.co.jp");
});

test("当店のリンク用HTMLは属性をエスケープする", () => {
  assert.equal(
    ownLinkBannerHtml({ siteUrl: "https://enka-salon.jp/", imageUrl: "https://x/b.png", name: "艶華\"<>" }),
    '<a href="https://enka-salon.jp/" target="_blank"><img src="https://x/b.png" alt="艶華&quot;&lt;&gt;" border="0"></a>',
  );
  assert.equal(
    ownLinkBannerHtml({ siteUrl: "https://enka-salon.jp/", imageUrl: "", name: "艶華" }),
    '<a href="https://enka-salon.jp/" target="_blank">艶華</a>',
  );
});
