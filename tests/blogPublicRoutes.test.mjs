import assert from "node:assert/strict";
import test from "node:test";

process.env.SUPABASE_ANON_KEY = "test-public-key";
const { default: spaHandler } = await import("../api/spa.js");
const { default: sitemapHandler } = await import("../api/sitemap.js");

const baseHtml = `<!doctype html><html lang="en"><head>
<title>placeholder</title>
<meta name="description" content="placeholder">
<meta name="author" content="placeholder">
<meta name="robots" content="placeholder">
<meta name="googlebot" content="placeholder">
<meta property="og:title" content="placeholder">
<meta property="og:description" content="placeholder">
<meta property="og:type" content="website">
<meta property="og:url" content="placeholder">
<meta property="og:site_name" content="placeholder">
<meta property="og:image" content="placeholder">
<meta name="twitter:title" content="placeholder">
<meta name="twitter:description" content="placeholder">
<meta name="twitter:image" content="placeholder">
<link rel="canonical" href="placeholder">
<link rel="icon" href="placeholder">
</head><body><div id="root"></div></body></html>`;

const makeResponse = () => {
  const result = { statusCode: 200, headers: {}, body: "" };
  return {
    setHeader(name, value) { result.headers[name] = value; },
    status(code) { result.statusCode = code; return this; },
    send(body) { result.body = body; },
    result,
  };
};

test("blog article renderer returns article-specific SEO metadata and JSON-LD", async () => {
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    const text = String(url);
    if (text.endsWith("/index.html")) return new Response(baseHtml, { status: 200 });
    if (text.includes("/rest/v1/hp_articles")) {
      return new Response(JSON.stringify([{
        title: "初めての方へ｜予約からご来店までの流れ",
        slug: "first-visit-guide",
        content: "最初に予約方法をご確認ください。",
        excerpt: "初めてご利用の方へ、予約からご来店までの流れをまとめました。",
        seo_title: "初めての方向けご利用ガイド｜艶華",
        seo_description: "初めてご利用の方が予約前に確認したいポイントをご案内します。",
        image_urls: ["https://example.com/cover.jpg"],
        published_at: "2026-09-20T00:00:00.000Z",
        updated_at: "2026-09-20T01:00:00.000Z",
        created_at: "2026-09-20T00:00:00.000Z",
      }]), { status: 200 });
    }
    throw new Error(`Unexpected fetch: ${text}`);
  };
  try {
    const res = makeResponse();
    await spaHandler({ headers: { host: "enka-salon.jp" }, url: "/blog/first-visit-guide" }, res);
    assert.equal(res.result.statusCode, 200);
    assert.match(res.result.body, /<title>初めての方向けご利用ガイド｜艶華<\/title>/);
    assert.match(res.result.body, /<meta property="og:type" content="article">/);
    assert.match(res.result.body, /https:\/\/enka-salon\.jp\/blog\/first-visit-guide/);
    assert.match(res.result.body, /"@type":"BlogPosting"/);
    assert.match(res.result.body, /https:\/\/example\.com\/cover\.jpg/);
  } finally {
    global.fetch = originalFetch;
  }
});

test("missing blog article receives noindex metadata", async () => {
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    const text = String(url);
    if (text.endsWith("/index.html")) return new Response(baseHtml, { status: 200 });
    if (text.includes("/rest/v1/hp_articles")) return new Response("[]", { status: 200 });
    throw new Error(`Unexpected fetch: ${text}`);
  };
  try {
    const res = makeResponse();
    await spaHandler({ headers: { host: "enka-salon.jp" }, url: "/blog/missing" }, res);
    assert.match(res.result.body, /<meta name="robots" content="noindex,follow">/);
    assert.doesNotMatch(res.result.body, /"@type":"BlogPosting"/);
  } finally {
    global.fetch = originalFetch;
  }
});

test("sitemap includes published blog URLs", async () => {
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    assert.match(String(url), /\/rest\/v1\/hp_articles/);
    return new Response(JSON.stringify([{
      slug: "first-visit-guide",
      published_at: "2026-09-20T00:00:00.000Z",
      updated_at: "2026-09-20T01:00:00.000Z",
      created_at: "2026-09-20T00:00:00.000Z",
    }]), { status: 200 });
  };
  try {
    const res = makeResponse();
    await sitemapHandler({}, res);
    assert.equal(res.result.statusCode, 200);
    assert.match(res.result.body, /<loc>https:\/\/enka-salon\.jp\/blog<\/loc>/);
    assert.match(res.result.body, /<loc>https:\/\/enka-salon\.jp\/blog\/first-visit-guide<\/loc>/);
    assert.match(res.result.body, /<lastmod>2026-09-20<\/lastmod>/);
  } finally {
    global.fetch = originalFetch;
  }
});
