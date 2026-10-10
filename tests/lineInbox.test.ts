import { test } from "node:test";
import assert from "node:assert/strict";
import { lineWebhookUrl, needsStaff, sortThreads, waitingInfo } from "../src/lib/lineInbox.ts";

test("返事待ちの経過と自動応答までの残り", () => {
  const now = Date.parse("2026-10-11T10:07:30Z");
  assert.deepEqual(waitingInfo({ status: "waiting", waiting_since: "2026-10-11T10:05:00Z" }, now, 5), { elapsed: 2, remaining: 3 });
  assert.deepEqual(waitingInfo({ status: "waiting", waiting_since: "2026-10-11T09:55:00Z" }, now, 5), { elapsed: 12, remaining: 0 });
  assert.deepEqual(waitingInfo({ status: "waiting", waiting_since: "2026-10-11T10:05:00Z" }, now, null), { elapsed: 2, remaining: null });
  assert.equal(waitingInfo({ status: "handled", waiting_since: null }, now, 5), null);
});

test("並び順：返事待ち（古い順）→ 失敗 → 自動 → 対応済み", () => {
  const sorted = sortThreads([
    { id: "h", status: "handled" as const, waiting_since: null, last_message_at: "2026-10-11T10:09:00Z" },
    { id: "w2", status: "waiting" as const, waiting_since: "2026-10-11T10:06:00Z", last_message_at: "2026-10-11T10:06:00Z" },
    { id: "a", status: "auto_replied" as const, waiting_since: null, last_message_at: "2026-10-11T10:00:00Z" },
    { id: "w1", status: "waiting" as const, waiting_since: "2026-10-11T10:01:00Z", last_message_at: "2026-10-11T10:08:00Z" },
    { id: "f", status: "failed" as const, waiting_since: "2026-10-11T09:00:00Z", last_message_at: "2026-10-11T09:00:00Z" },
  ]);
  assert.deepEqual(sorted.map((t) => t.id), ["w1", "w2", "f", "a", "h"]);
  assert.equal(needsStaff({ status: "auto_replied" }), true);
  assert.equal(needsStaff({ status: "handled" }), false);
});

test("Webhook URL", () => {
  assert.equal(lineWebhookUrl("https://x.supabase.co/", "ab"), "https://x.supabase.co/functions/v1/line-customer-webhook?k=ab");
});
