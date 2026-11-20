import assert from "node:assert/strict";
import test from "node:test";
import { lookupUsers, userTweets } from "../supabase/functions/_shared/xApi.ts";

const credentials = { apiKey: "k", apiSecret: "s", accessToken: "t", accessTokenSecret: "ts" };

test("本人のXの読み取り：IDを引き、since_id とページ送りで投稿を集める", async () => {
  const seen: string[] = [];
  const fakeFetch = (async (input: string | URL) => {
    const url = String(input);
    seen.push(url);
    if (url.includes("/users/by")) return new Response(JSON.stringify({ data: [{ id: "100", username: "sample_user" }] }), { status: 200 });
    if (url.includes("pagination_token=n1")) return new Response(JSON.stringify({ data: [{ id: "8", text: "b", created_at: "2026-11-02T00:00:00Z" }], meta: {} }), { status: 200 });
    return new Response(JSON.stringify({ data: [{ id: "9", text: "a", created_at: "2026-11-03T00:00:00Z" }], meta: { next_token: "n1" } }), { status: 200 });
  }) as typeof fetch;

  const users = await lookupUsers(credentials, ["sample_user"], fakeFetch);
  assert.equal(users.ok, true);
  assert.equal(users.users[0].id, "100");

  const result = await userTweets(credentials, "100", { sinceId: "5" }, fakeFetch);
  assert.equal(result.ok, true);
  assert.deepEqual(result.tweets.map((t) => t.id), ["9", "8"]);
  assert.ok(seen.some((url) => url.includes("since_id=5") && url.includes("exclude=retweets%2Creplies")));
  assert.match(seen[1], /^https:\/\/api\.x\.com\/2\/users\/100\/tweets\?/);
});

test("本人のXの読み取り：プランで読めない（403/402）は止める合図、429は時間をおく", async () => {
  const respond = (status: number) => (async () => new Response(JSON.stringify({ title: "Forbidden" }), { status })) as typeof fetch;
  const forbidden = await userTweets(credentials, "1", {}, respond(403));
  assert.equal(forbidden.ok, false);
  assert.equal(forbidden.needsAttention, true);
  assert.match(forbidden.error ?? "", /読み取り/);
  const limited = await userTweets(credentials, "1", {}, respond(429));
  assert.equal(limited.needsAttention, false);
  assert.match(limited.error ?? "", /上限/);
});
