import assert from "node:assert/strict";
import test from "node:test";
import {
  getMissingNewsletterLinkWarnings,
  getUnresolvedNewsletterLinkWarnings,
  NEWSLETTER_TEMPLATES,
  type NewsletterLinkSettings,
} from "../src/lib/newsletterTemplates.ts";

const completeLinks: NewsletterLinkSettings = {
  homepageUrl: "https://example.jp/",
  couponUrl: "https://line.me/R/example-coupon",
  socialUrls: {
    x: "https://x.com/example",
    line: "https://lin.ee/example",
    o2: "https://m-sns.net/s/example",
    instagram: "https://instagram.com/example",
    bluesky: "https://bsky.app/profile/example.bsky.social",
  },
};

test("five templates include HP, social, and coupon links when configured", () => {
  assert.equal(NEWSLETTER_TEMPLATES.length, 5);

  for (const template of NEWSLETTER_TEMPLATES) {
    const draft = template.buildDraft(completeLinks, "テスト店舗");
    assert.ok(draft.title.length > 0, `${template.id} has a management title`);
    assert.ok(draft.subject.includes("テスト店舗"), `${template.id} includes the store name`);
    assert.match(draft.bodyText, /https:\/\/example\.jp\//, `${template.id} includes the HP link`);
    assert.match(draft.bodyText, /https:\/\/x\.com\/example/, `${template.id} includes social links`);
    assert.match(draft.bodyText, /https:\/\/line\.me\/R\/example-coupon/, `${template.id} includes the coupon link`);
    assert.deepEqual(getUnresolvedNewsletterLinkWarnings(draft.bodyText), [], `${template.id} has no unresolved links`);
  }
});

test("missing links are identified and remain visible in an applied template", () => {
  const noLinks: NewsletterLinkSettings = {
    homepageUrl: "",
    couponUrl: "not-a-url",
    socialUrls: { x: "", line: "", o2: "", instagram: "", bluesky: "" },
  };
  assert.deepEqual(getMissingNewsletterLinkWarnings(noLinks), ["HPリンク", "クーポン受取リンク", "SNSリンク"]);

  const draft = NEWSLETTER_TEMPLATES[0].buildDraft(noLinks, "テスト店舗");
  assert.deepEqual(getUnresolvedNewsletterLinkWarnings(draft.bodyText), ["HPリンク", "クーポン受取リンク", "SNSリンク"]);
});
