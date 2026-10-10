import assert from "node:assert/strict";
import test from "node:test";
import { isRetryableCrossPost } from "../server/cross-post-reconcile-utils.ts";

test("pending and ordinary failures retry up to three attempts", () => {
  assert.equal(isRetryableCrossPost("pending", null, 0), true);
  assert.equal(isRetryableCrossPost("failed", "一時的な接続エラー", 2), true);
  assert.equal(isRetryableCrossPost("failed", "一時的な接続エラー", 3), false);
  assert.equal(isRetryableCrossPost("skipped", "ログイン切れ", 0), false);
  assert.equal(isRetryableCrossPost("skipped", "ログイン切れ", 0, 3, true), true);
});

test("posted, posting and uncertain submissions never auto retry", () => {
  assert.equal(isRetryableCrossPost("posted", null, 0), false);
  assert.equal(isRetryableCrossPost("posting", null, 0), false);
  assert.equal(isRetryableCrossPost("failed", "【要確認・再送停止】掲載結果が不明です", 1), false);
});

