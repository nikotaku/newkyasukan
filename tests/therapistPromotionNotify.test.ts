import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { promotionTaskMessage } from "../supabase/functions/push-notify/messages.ts";

const migration = readFileSync(new URL("../supabase/migrations/20261103003000_therapist_promotion_reports.sql", import.meta.url), "utf8");
const report = {
  id: "11111111-2222-4333-8444-555555555555",
  plan_id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  scheduled_on: "2026-11-03",
  task_label: "本人X：告知を投稿",
  plan_title: "秋の企画",
};

test("投稿完了通知には本人・予定日・タスク・企画名と、対象企画へのリンクが入る", () => {
  assert.deepEqual(promotionTaskMessage(report, "こよみ"), {
    title: "こよみさんが投稿しました",
    body: "11/3(火) / 本人X：告知を投稿 / 秋の企画",
    url: `/promotion-schedule?tab=plans&plan=${report.plan_id}`,
    tag: `promotion-task-${report.id}`,
  });
});

test("通知は短くし、欠けた名前や本文も安全に表示する。同じ完了記録は同じタグ", () => {
  const message = promotionTaskMessage({ ...report, task_label: "長い投稿\n".repeat(100) }, "  こよみ  ");
  assert.equal(message.title, "こよみさんが投稿しました");
  assert.equal(message.body.length, 120);
  assert.ok(message.body.endsWith("…"));
  assert.doesNotMatch(message.body, /\n/);
  assert.equal(message.tag, promotionTaskMessage(report, "こよみ").tag);
  const fallback = promotionTaskMessage({ ...report, scheduled_on: null, task_label: null, plan_title: null }, null);
  assert.equal(fallback.title, "セラピストが投稿しました");
  assert.equal(fallback.body, "企画の投稿完了報告を確認してください");
});

test("新しいJSON APIは既存の戻り値・存在しない報酬列・全体タスク状態を変更しない", () => {
  assert.match(migration, /create table if not exists public\.therapist_promotion_task_completions/);
  assert.match(migration, /add column if not exists admin_seen_at timestamptz/);
  assert.match(migration, /get_therapist_promotion_schedule\(p_token text\)\s+returns jsonb/);
  assert.doesNotMatch(migration, /(?:create|drop)\s+(?:or replace\s+)?function\s+(?:if exists\s+)?public\.(?:get_therapist_promotion_schedules|get_therapist_promotion_channels|get_therapist_growth_stats)\(/i);
  assert.doesNotMatch(migration, /t\.reward_points|add column[^;]*reward_points/i);
  assert.doesNotMatch(migration, /update\s+public\.promotion_plan_tasks/i);
  assert.match(migration, /'isCompleted', coalesce\(tc\.is_completed, false\)/);
  assert.match(migration, /'storeCompleted', t\.is_completed/);
  assert.match(migration, /t\.plan_id = p\.id and t\.store_id = p\.store_id/);
  assert.match(migration, /pc\.plan_id = p\.id and pc\.store_id = p\.store_id/);
});

test("本人用書込は在籍・店舗・明示対象または旧形式の完全一致を検証し、同値は変更しない", () => {
  const complete = migration.split("create or replace function public.complete_therapist_promotion_task")[1].split("create or replace function public.get_therapist_promotion_reports")[0];
  assert.match(complete, /btrim\(p_token\) = ''/);
  assert.match(complete, /c\.access_token = p_token and c\.is_active = true/);
  assert.match(complete, /p\.store_id = t\.store_id/);
  assert.match(complete, /t\.store_id = v_store_id and p\.is_active = true/);
  assert.match(complete, /v_cast_id = any\(p\.cast_ids\)/);
  assert.match(complete, /cardinality\(p\.cast_ids\) = 0 and/);
  assert.match(complete, /p\.therapist_label = v_cast_name/);
  assert.match(complete, /regexp_split_to_array\(p\.therapist_label, '\\s\*\[&＆\]\\s\*'\)/);
  assert.match(complete, /if p_completed is null then/);
  assert.match(complete, /errcode = '42501'/);
  assert.match(complete, /completion\.is_completed is distinct from excluded\.is_completed/);
  assert.match(complete, /admin_seen_at = case when excluded\.is_completed then null else completion\.admin_seen_at end/);
  assert.match(complete, /tc\.store_id = v_store_id and tc\.is_completed = p_completed/);
  assert.match(complete, /raise exception 'completion is not available for this therapist'/);
  assert.match(complete, /return p_completed/);
});

test("管理報告は認証済み管理者だけ・投稿だけ・同店舗の結合だけ・最新200件。直接書込を許可しない", () => {
  assert.match(migration, /for select to authenticated\s+using \(\(select public\.can_manage_store\(store_id\)\)\)/);
  assert.match(migration, /revoke all on table public\.therapist_promotion_task_completions from public, anon, authenticated, service_role/);
  assert.match(migration, /grant select on table public\.therapist_promotion_task_completions to authenticated, service_role/);
  assert.doesNotMatch(migration, /grant (?:all|insert|update|delete|select, insert)[^;]*therapist_promotion_task_completions/i);
  const reports = migration.split("create or replace function public.get_therapist_promotion_reports")[1].split("-- Append only")[0];
  assert.match(reports, /auth\.uid\(\) is null/);
  assert.match(reports, /public\.can_manage_store\(p_store_id\)/);
  assert.match(reports, /tc\.is_completed = true and t\.task_type = 'posting'/);
  for (const alias of ["c", "t", "p"]) assert.match(reports, new RegExp(`${alias}\\.store_id = tc\\.store_id`));
  assert.match(reports, /limit 200/);
  assert.match(reports, /admin_seen_at is null/);
  assert.match(reports, /get_therapist_promotion_reports\(uuid, boolean\) to authenticated;/);
  assert.match(reports, /mark_therapist_promotion_report_seen\(uuid\) to authenticated;/);
  assert.doesNotMatch(reports, /grant execute[^;]*to anon/);
});

test("独立した通知トリガーは完了への遷移だけ・購読店舗と種類を限定・通知失敗は保存を壊さない", () => {
  assert.doesNotMatch(migration, /create or replace function public\.trg_push_notify\(\)/);
  assert.match(migration, /if new\.is_completed is not true then return new/);
  assert.match(migration, /if old\.is_completed is true then return new/);
  assert.match(migration, /s\.store_id = new\.store_id and 'promotion_task' = any\(s\.topics\)/);
  assert.match(migration, /vault\.decrypted_secrets where name = 'push_notify_internal_secret'/);
  assert.match(migration, /'x-push-notify-secret', v_secret/);
  assert.match(migration, /jsonb_build_object\('event', 'promotion_task', 'id', new\.id\)/);
  assert.match(migration, /exception when others then[\s\S]*return new/);
  assert.match(migration, /topics = array_append\(coalesce\(topics, '\{\}'::text\[\]\), 'promotion_task'\)/);
  assert.match(migration, /pg_get_expr\(d\.adbin, d\.adrelid\)/);
  const topics = readFileSync(new URL("../src/lib/adminPush.ts", import.meta.url), "utf8");
  assert.match(topics, /key: "promotion_task"/);
});

test("push endpoint re-reads completion and store-scoped joins; unchecked/preparation/cross-store reports cannot notify", async (t) => {
  type Handler = (request: Request) => Promise<Response>;
  const runtime = globalThis as typeof globalThis & {
    Deno?: { env: { get: (key: string) => string }; serve: (callback: Handler) => void };
  };
  const oldDeno = runtime.Deno;
  const oldFetch = globalThis.fetch;
  let handler: Handler | undefined;
  const calls: string[] = [];
  let verified = true;
  let completion: Record<string, unknown> | null;
  let cast: Record<string, unknown> | null;
  let task: Record<string, unknown> | null;
  let plan: Record<string, unknown> | null;
  const store = "99999999-9999-4999-8999-999999999999";
  const reset = () => {
    calls.length = 0;
    verified = true;
    completion = { id: report.id, store_id: store, cast_id: "cast", task_id: "task", is_completed: true };
    cast = { id: "cast", name: "こよみ" };
    task = { id: "task", plan_id: report.plan_id, task_type: "posting", scheduled_on: report.scheduled_on, label: report.task_label };
    plan = { id: report.plan_id, title: report.plan_title };
  };
  runtime.Deno = {
    env: { get: (key) => key === "SUPABASE_URL" ? "https://supabase.example.invalid" : "test-key" },
    serve: (callback) => { handler = callback; },
  };
  globalThis.fetch = async (input) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    calls.push(url.pathname + url.search);
    const resource = url.pathname.split("/").at(-1);
    let result: unknown;
    if (resource === "verify_push_notify_secret") result = verified;
    else if (resource === "therapist_promotion_task_completions") result = completion ? [completion] : [];
    else if (resource === "casts") result = cast ? [cast] : [];
    else if (resource === "promotion_plan_tasks") result = task ? [task] : [];
    else if (resource === "promotion_plans") result = plan ? [plan] : [];
    else if (resource === "push_subscriptions") result = [];
    else throw new Error(`Unexpected request: ${url}`);
    return new Response(JSON.stringify(result), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  const invoke = async () => {
    assert.ok(handler);
    const response = await handler(new Request("https://edge.example.invalid/push-notify", {
      method: "POST", headers: { "Content-Type": "application/json", "x-push-notify-secret": "test-secret" },
      // These forged properties must never influence the server-built notification.
      body: JSON.stringify({ event: "promotion_task", id: report.id, storeId: "other-store", castName: "forged" }),
    }));
    return { status: response.status, body: await response.json() };
  };
  try {
    await import("../supabase/functions/push-notify/index.ts");
    await t.test("invalid internal secret fails before reading any completion", async () => {
      reset(); verified = false;
      assert.equal((await invoke()).status, 403);
      assert.equal(calls.length, 1);
    });
    await t.test("valid posting targets only the report store and promotion topic", async () => {
      reset();
      assert.deepEqual((await invoke()).body, { targets: 0, sent: 0 });
      const subscriptions = calls.find((url) => url.includes("/push_subscriptions?"));
      assert.ok(subscriptions);
      const params = new URL(`https://test.invalid${subscriptions}`).searchParams;
      assert.equal(params.get("store_id"), `eq.${store}`);
      assert.equal(params.get("topics"), "cs.{promotion_task}");
      for (const resource of ["casts", "promotion_plan_tasks", "promotion_plans"]) {
        const requested = calls.find((url) => url.includes(`/${resource}?`));
        assert.ok(requested);
        assert.equal(new URL(`https://test.invalid${requested}`).searchParams.get("store_id"), `eq.${store}`);
      }
      assert.ok(calls.some((url) => url.includes("task_type=eq.posting")));
    });
    for (const scenario of ["missing", "unchecked", "missing-store", "preparation", "cross-store-cast", "cross-store-task", "cross-store-plan"] as const) {
      await t.test(`${scenario} is skipped without reading subscriptions`, async () => {
        reset();
        if (scenario === "missing") completion = null;
        if (scenario === "unchecked") completion!.is_completed = false;
        if (scenario === "missing-store") completion!.store_id = null;
        if (scenario === "preparation") task!.task_type = "preparation";
        if (scenario === "cross-store-cast") cast = null;
        if (scenario === "cross-store-task") task = null;
        if (scenario === "cross-store-plan") plan = null;
        assert.deepEqual((await invoke()).body, { skipped: true });
        assert.ok(!calls.some((url) => url.includes("/push_subscriptions?")));
      });
    }
  } finally {
    globalThis.fetch = oldFetch;
    if (oldDeno === undefined) delete runtime.Deno;
    else runtime.Deno = oldDeno;
  }
});


test("投稿報告トリガーはJWT必須の通知ゲートウェイにも認証情報を渡す", async () => {
  const sql = migration;
  assert.match(sql, /'Authorization', 'Bearer eyJ/);
  assert.match(sql, /'x-push-notify-secret', v_secret/);
});
