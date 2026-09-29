import assert from "node:assert/strict";
import test from "node:test";

import { oauthSignature, postTweet, verifyCredentials } from "../supabase/functions/_shared/xApi.ts";
import { businessMinutes, decideAutoPost } from "../src/lib/xAutoPost.ts";
import type { XDailyPost } from "../src/lib/xDailyPosts.ts";

const post = (overrides: Partial<XDailyPost> = {}): XDailyPost => ({
  slotKey: "12:00|本日の出勤",
  accountKey: "shukyaku",
  accountName: "集客",
  time: "12:00",
  type: "本日の出勤",
  kind: "today_shift",
  text: "本日の出勤です",
  imageKind: "shift_today",
  pickup: null,
  warning: null,
  ...overrides,
});

test("OAuth 1.0a の署名が X の公式ドキュメントの例と一致する", async () => {
  const { signature } = await oauthSignature({
    method: "POST",
    url: "https://api.twitter.com/1.1/statuses/update.json?include_entities=true",
    credentials: {
      apiKey: "xvz1evFS4wEEPTGEFPHBog",
      apiSecret: "kAcSOqF21Fu85e7zjz7ZN2U4ZRhfV3WpwPAoE3Z7kBw",
      accessToken: "370773112-GmHxMAgYyLbNEtIKZeRNFsMKPR9EyMZeS9weJAEb",
      accessTokenSecret: "LswwdoUaIvS8ltyTt5jkRh4J50vUPVVHtR2YPi5kE",
    },
    bodyParams: { status: "Hello Ladies + Gentlemen, a signed OAuth request!" },
    nonce: "kYjzVBB8Y0ZFabxSWbWovY3uYSQ2pTgmZeNu2VS4cg",
    timestamp: 1318622958,
  });
  assert.equal(signature, "hCtSmYh+iHYCEqBWrE7C7hYmtUk=");
});

test("営業日の分：0時〜6時前は前日の続き", () => {
  assert.equal(businessMinutes("12:00"), 720);
  assert.equal(businessMinutes("0:30"), 24 * 60 + 30);
  assert.equal(businessMinutes("25:00"), 1500);
  assert.equal(businessMinutes("夜"), null);
});

test("時間になったら出す・前は待つ・30分以上遅れたら出さない", () => {
  assert.equal(decideAutoPost(post(), undefined, 11 * 60 + 59).action, "wait");
  assert.equal(decideAutoPost(post(), undefined, 12 * 60).action, "post");
  assert.equal(decideAutoPost(post(), undefined, 12 * 60 + 30).action, "post");
  assert.equal(decideAutoPost(post(), undefined, 12 * 60 + 31).action, "missed");
  // 深夜の枠は日付をまたいでも正しく比べる
  assert.equal(decideAutoPost(post({ time: "0:30" }), undefined, 23 * 60).action, "wait");
  assert.equal(decideAutoPost(post({ time: "0:30" }), undefined, 40).action, "post");
});

test("AIの投稿・注意つき・長すぎる投稿・投稿済みは出さない", () => {
  assert.equal(decideAutoPost(post({ kind: "ai" }), undefined, 720).action, "skip");
  assert.equal(decideAutoPost(post({ warning: "出勤が未登録です" }), undefined, 720).action, "skip");
  assert.equal(decideAutoPost(post({ text: "あ".repeat(141) }), undefined, 720).action, "skip");
  const posted = { text: null, text_source: null, posted_at: "2026-09-29T03:00:00Z", publish_status: null, attempts: 0 };
  assert.equal(decideAutoPost(post(), posted, 720).action, "done");
});

test("手直しした文があればそれを出す。失敗は2回まで出し直す", () => {
  const edited = { text: "手直しした文", text_source: "edited" as const, posted_at: null, publish_status: null, attempts: 0 };
  assert.equal(decideAutoPost(post(), edited, 720).text, "手直しした文");
  const failedOnce = { text: null, text_source: null, posted_at: null, publish_status: "failed", attempts: 1 };
  assert.equal(decideAutoPost(post(), failedOnce, 725).action, "post");
  assert.equal(decideAutoPost(post(), { ...failedOnce, attempts: 2 }, 725).action, "done");
});

test("見送り（出勤未登録など）は時間内なら次の回にまた判断し、時間を過ぎたら確定", () => {
  const skipped = { text: null, text_source: null, posted_at: null, publish_status: "skipped", attempts: 0 };
  assert.equal(decideAutoPost(post(), skipped, 725).action, "post");
  assert.equal(decideAutoPost(post(), skipped, 12 * 60 + 45).action, "done");
});

const credentials = { apiKey: "k", apiSecret: "s", accessToken: "t", accessTokenSecret: "ts" };

test("投稿：成功ならIDを返し、署名つきのヘッダーで JSON を送る", async () => {
  let seen: { url: string; init: RequestInit } | null = null;
  const fetchImpl = (async (url: string, init: RequestInit) => {
    seen = { url, init };
    return new Response(JSON.stringify({ data: { id: "123", text: "hi" } }), { status: 201 });
  }) as unknown as typeof fetch;
  const result = await postTweet(credentials, "こんにちは", fetchImpl);
  assert.equal(result.ok, true);
  assert.equal(result.id, "123");
  assert.equal(seen!.url, "https://api.x.com/2/tweets");
  assert.match(String((seen!.init.headers as Record<string, string>).Authorization), /^OAuth .*oauth_signature="/);
  assert.equal(seen!.init.body, JSON.stringify({ text: "こんにちは" }));
});

test("投稿：キー無効は要対応、同じ文の重複はそのまま失敗", async () => {
  const respond = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
  const unauthorized = await postTweet(credentials, "x", respond(401, { title: "Unauthorized", status: 401 }));
  assert.equal(unauthorized.ok, false);
  assert.equal(unauthorized.needsAttention, true);
  const duplicate = await postTweet(credentials, "x", respond(403, { detail: "You are not allowed to create a Tweet with duplicate content.", status: 403 }));
  assert.equal(duplicate.needsAttention, false);
  assert.match(duplicate.error!, /同じ文章/);
  const me = await verifyCredentials(credentials, respond(200, { data: { id: "1", username: "enka_sendai" } }));
  assert.equal(me.username, "enka_sendai");
});
