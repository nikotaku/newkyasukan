import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeLineImage, imageContentType, fetchLineImage } from "../supabase/functions/_shared/lineCustomerMedia.ts";
import { isHarnessRelay, pushLineMessages } from "../supabase/functions/_shared/lineCustomerApi.ts";
import { mergeLineMessages, filterLineThreads, type LineMessage, type LineThread } from "../src/lib/lineInbox.ts";

test("画像は実データで判定し、HTMLや不正なbase64・サイズ超過を拒否する", () => {
  const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+cN1kAAAAASUVORK5CYII=";
  assert.equal(decodeLineImage(png).contentType, "image/png");
  assert.equal(imageContentType(new Uint8Array([255,216,255,0])), "image/jpeg");
  assert.throws(() => decodeLineImage(btoa("<html>")));
  assert.throws(() => decodeLineImage("!!!"));
  assert.throws(() => decodeLineImage("a".repeat(7_000_000)));
});

test("LINEの画像と文章は同じ配信で送り、再試行の受理済み409を成功と扱う", async () => {
  const original = globalThis.fetch;
  let captured: RequestInit | undefined;
  globalThis.fetch = (async (_url, options) => {
    captured = options;
    return new Response(null, { status: 409, headers: { "x-line-accepted-request-id": "accepted" } });
  }) as typeof fetch;
  try {
    const messages = [{ type: "image" as const, originalContentUrl: "https://example.com/image", previewImageUrl: "https://example.com/image" }, { type: "text" as const, text: "ご案内です" }];
    assert.deepEqual(await pushLineMessages("token", "user", messages, "request"), { ok: true });
    assert.deepEqual(JSON.parse(captured!.body as string), { to: "user", messages });
    assert.equal((captured!.headers as Record<string, string>)["X-Line-Retry-Key"], "request");
    globalThis.fetch = (async () => new Response("quota", { status: 429 })) as typeof fetch;
    assert.equal((await pushLineMessages("token", "user", messages, "request")).ok, false);
  } finally { globalThis.fetch = original; }
});

test("LINEからの巨大な画像はストリーム読込中も制限する", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => new Response(new Uint8Array(5 * 1024 * 1024 + 1))) as typeof fetch;
  try { await assert.rejects(() => fetchLineImage("token", "message"), /5MB/); }
  finally { globalThis.fetch = original; }
});

test("過去のページと新着の更新をまとめても重複せず、取り消しも反映される", () => {
  const message = (id: string, at: string, text = id) => ({ id, created_at: at, text } as LineMessage);
  const old = [message("b", "2026-11-11T12:00:00Z"), message("c", "2026-11-11T13:00:00Z")];
  const merged = mergeLineMessages(old, [message("a", "2026-11-11T11:00:00Z"), message("b", "2026-11-11T12:00:00Z", "取り消し")]);
  assert.deepEqual(merged.map((m) => m.id), ["a", "b", "c"]);
  assert.equal(merged[1].text, "取り消し");
});

test("顧客名・最新メッセージで検索し、未対応のみに絞り込める", () => {
  const rows = [{ display_name: "佐藤", last_message_text: "明日の予約", status: "waiting", last_message_at: "2026-11-11T13:00:00Z" }, { display_name: "鈴木", last_message_text: "予約ありがとう", status: "handled", last_message_at: "2026-11-11T13:00:00Z" }] as LineThread[];
  assert.equal(filterLineThreads(rows, "予約", true).length, 1);
  assert.equal(filterLineThreads(rows, "鈴木", false).length, 1);
  assert.equal(filterLineThreads(rows, "存在しない", false).length, 0);
});


test("既存ハーネスの転送先だけ許可し、別ホスト・認証情報・HTTPを拒否する", () => {
  assert.equal(isHarnessRelay("https://line-harness.saito-crow.workers.dev/webhook/abc"), true);
  for (const url of ["http://line-harness.saito-crow.workers.dev/", "https://line-harness.saito-crow.workers.dev.evil.com/", "https://user:password@line-harness.saito-crow.workers.dev/", "https://127.0.0.1/"]) assert.equal(isHarnessRelay(url), false);
});
