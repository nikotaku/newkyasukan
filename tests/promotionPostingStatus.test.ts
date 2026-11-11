import test from "node:test";
import assert from "node:assert/strict";
import { promotionParticipants, postingCompletionIndex, postingCompletionKey, therapistPostingProgress } from "../src/lib/promotionPostingStatus.ts";

test("共同企画は一人だけの報告を全員完了と数えず、取消は未報告に戻す", () => {
  const index = postingCompletionIndex([
    { cast_id: "a", task_id: "x", is_completed: true, completed_at: "2026-11-11T16:00:00Z" },
    { cast_id: "b", task_id: "x", is_completed: false, completed_at: null },
    { cast_id: "outsider", task_id: "x", is_completed: true, completed_at: null },
  ]);
  assert.deepEqual(therapistPostingProgress(["x", "y"], ["a", "b"], index), { completed: 1, total: 4 });
  assert.equal(index.has(postingCompletionKey("b", "x")), false);
  assert.equal(index.get(postingCompletionKey("a", "x"))?.completed_at, "2026-11-11T16:00:00Z");
});

test("明示された対象者を優先し、古い企画だけポータルと同じ完全一致で照合する", () => {
  const casts = [{ id: "a", name: "りりか" }, { id: "b", name: "ももか" }, { id: "c", name: "りり" }];
  assert.deepEqual(promotionParticipants(["a", "a"], "りりか&ももか", casts), [casts[0]]);
  assert.deepEqual(promotionParticipants([], "りりか ＆ ももか", casts), casts.slice(0, 2));
  assert.deepEqual(promotionParticipants([], "不明", casts), []);
  assert.equal(promotionParticipants(["missing"], "ももか", casts)[0].id, "missing");
});

test("200件以上の報告を数え、重複や対象者なしでも件数を水増ししない", () => {
  const taskIds = Array.from({ length: 250 }, (_, i) => String(i));
  const index = postingCompletionIndex(taskIds.map((task_id) => ({ cast_id: "a", task_id, is_completed: true, completed_at: null })));
  assert.deepEqual(therapistPostingProgress([...taskIds, "0"], ["a", "a"], index), { completed: 250, total: 250 });
  assert.deepEqual(therapistPostingProgress(taskIds, [], index), { completed: 0, total: 0 });
});
