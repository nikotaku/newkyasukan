import assert from "node:assert/strict";
import test from "node:test";
import { makeNewsletterHtml } from "../supabase/functions/_shared/newsletter-html.ts";

test("newsletter email renderer turns configured links into clickable, escaped links", () => {
  const html = makeNewsletterHtml(
    "公式サイト\nhttps://example.jp/?source=newsletter&campaign=welcome\n\nクーポン\nhttps://line.me/R/example-coupon",
    "https://example.jp/newsletter/unsubscribe?token=abc",
  );

  assert.match(html, /href="https:\/\/example\.jp\/\?source=newsletter&amp;campaign=welcome"/);
  assert.match(html, /href="https:\/\/line\.me\/R\/example-coupon"/);
  assert.match(html, /配信を停止する/);
  assert.match(html, /<br \/>/);
});

test("newsletter email renderer escapes untrusted body text", () => {
  const html = makeNewsletterHtml("<script>alert('unsafe')</script>", "https://example.jp/unsubscribe");
  assert.ok(!html.includes("<script>"));
  assert.match(html, /&lt;script&gt;alert\(&#039;unsafe&#039;\)&lt;\/script&gt;/);
});
