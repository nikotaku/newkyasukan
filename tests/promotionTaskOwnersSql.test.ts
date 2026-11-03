import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";
import type { TherapistPromotionPlan, TherapistPromotionReport } from "../src/lib/therapistPromotion.ts";

interface CompletionRow {
  id: string; admin_seen_at: string | null; completed_at: string; is_completed: boolean;
}

const migration = readFileSync(new URL("../supabase/migrations/20261103062000_promotion_task_owners.sql", import.meta.url), "utf8");
const previous = readFileSync(new URL("../supabase/migrations/20261103003000_therapist_promotion_reports.sql", import.meta.url), "utf8");
const classifier = "private.is_therapist_promotion_task(coalesce(t.task_type, ''), coalesce(t.label, ''), coalesce(t.channel_key, ''))";
const functionBody = (name: string) => migration.split(`create or replace function ${name}(`)[1].split("$$;")[0];
const rpcNames = [
  "get_therapist_promotion_schedule",
  "complete_therapist_promotion_task",
  "get_therapist_promotion_reports",
  "mark_therapist_promotion_report_seen",
];

test("ownership is immutable, strict, prefix-only and private; migration changes no task data or preferences", () => {
  const body = functionBody("private.is_therapist_promotion_task");
  assert.match(body, /returns boolean\s+language sql immutable strict set search_path = ''/);
  assert.match(body, /split_part\(replace\(p_label, '：', ':'\), ':', 1\)/);
  assert.ok(body.indexOf("(店舗|お店|公式アカウント)") < body.indexOf("when p_channel in ('x_post'"));
  assert.ok(body.indexOf("(バナー|ニュース|LINE|ＬＩＮＥ)") < body.indexOf("when p_channel in ('x_post'"));
  assert.match(body, /else false/);
  assert.match(migration, /revoke all on function private\.is_therapist_promotion_task\(text, text, text\) from public, anon, authenticated, service_role/);
  assert.doesNotMatch(migration, /^grant[^;]*private\.is_therapist_promotion_task/im);
  assert.doesNotMatch(migration, /private\.promotion_task_kind/);
  assert.doesNotMatch(migration, /\b(?:delete from|truncate|alter table|create table|drop table|create trigger|drop trigger)\b/i);
  assert.doesNotMatch(migration, /update\s+public\.(?:promotion_plan_tasks|promotion_plans|push_subscriptions)/i);
  assert.doesNotMatch(migration, /array_append|set default|reward_points|task_owner/i);
  assert.deepEqual([...migration.matchAll(/create or replace function (\S+)\(/g)].map(m => m[1]), [
    "private.is_therapist_promotion_task", ...rpcNames.map(name => `public.${name}`), "public.trg_push_notify_promotion_task",
  ]);
});

test("all ownership-sensitive paths share the classifier and preserve authorization, UPSERT, joins and grants", () => {
  for (const name of [...rpcNames, "trg_push_notify_promotion_task"]) {
    const body = functionBody(`public.${name}`);
    assert.match(body, /security definer set search_path = ''/);
    assert.ok(body.includes(classifier), `${name} must share ownership classification`);
  }
  for (const name of rpcNames.slice(0, 2)) {
    const body = functionBody(`public.${name}`);
    assert.match(body, /c\.access_token = p_token and c\.is_active = true/);
    assert.match(body, /v_cast_id = any\(p\.cast_ids\)/);
    assert.match(body, /cardinality\(p\.cast_ids\) = 0 and/);
    assert.match(body, /p\.therapist_label = v_cast_name/);
    assert.match(body, /regexp_split_to_array\(p\.therapist_label, '\\s\*\[&＆\]\\s\*'\)/);
  }
  const schedule = functionBody("public.get_therapist_promotion_schedule");
  assert.match(schedule, /'channelKey', t\.channel_key/);
  assert.match(schedule, /'description', null/);
  assert.match(schedule, /'storeCompleted', false/);
  assert.match(schedule, /'count', visible\.task_count/);
  assert.match(schedule, /count\(\*\)::integer as task_count/);
  assert.match(schedule, /t\.channel_key = pc\.channel_key/);
  assert.match(schedule, /visible on visible\.task_count > 0/);
  assert.match(schedule, /pc\.store_id = p\.store_id and pc\.is_enabled = true/);
  assert.match(schedule, /and exists \(\s+select 1 from public\.promotion_plan_tasks t/);
  assert.doesNotMatch(schedule, /p\.description|pc\.placement_count/);
  const complete = functionBody("public.complete_therapist_promotion_task");
  assert.match(complete, /t\.store_id = v_store_id and p\.is_active = true/);
  assert.match(complete, /completion\.is_completed is distinct from excluded\.is_completed/);
  assert.match(complete, /tc\.store_id = v_store_id and tc\.is_completed = p_completed/);
  assert.match(complete, /raise exception 'completion is not available for this therapist'/);
  assert.match(complete, /admin_seen_at = case when excluded\.is_completed then null else completion\.admin_seen_at end/);
  for (const name of rpcNames.slice(2)) {
    const body = functionBody(`public.${name}`);
    assert.match(body, /auth\.uid\(\) is null/);
    for (const alias of ["c", "t", "p"]) assert.ok(body.includes(`${alias}.store_id = tc.store_id`));
  }
  assert.match(functionBody("public.get_therapist_promotion_reports"), /limit 200/);
  for (const line of previous.split("\n").filter(line => /^(?:revoke|grant).*function public\./.test(line))) {
    assert.ok(migration.includes(line), `preserve existing function privilege: ${line}`);
  }
  const transport = (sql: string) => sql.split("  perform net.http_post(")[1].split("  return new;")[0];
  assert.equal(transport(migration), transport(previous), "push URL, JWT, secret header, body and timeout must remain identical");
});

// Run source checks without extra dependencies. For the integration checks install
// @electric-sql/pglite locally, or set PROMOTION_TASK_OWNERS_SQL_TEST_DIR to an
// isolated directory containing node_modules. The task sandbox uses the allowed
// /tmp/promotion-task-owners-sql/node_modules symlink, without changing package.json.
const require = createRequire(import.meta.url);
let pglitePath: string | undefined;
try {
  pglitePath = require.resolve("@electric-sql/pglite", {
    paths: [process.cwd(), process.env.PROMOTION_TASK_OWNERS_SQL_TEST_DIR ?? "/tmp/promotion-task-owners-sql"],
  });
} catch {
  // A normal repository run still executes all source-structure regressions.
}

const u = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const matrix: [string, string, string, boolean][] = [
  ["preparation", "本人X：準備", "x_post", false],
  ["", "X：告知", "x_post", false],
  ["Posting", "X：告知", "x_post", false],
  ...["hp_top_banner", "estama_top_banner", "hp_news", "estama_news", "line_official"].map(channel => ["posting", "本人X：告知", channel, false] as [string, string, string, boolean]),
  ["posting", "店舗X：紹介", "x_post", false],
  ["posting", "店舗X：紹介", "", false],
  ["posting", "お店X：紹介", "x_post", false],
  ["posting", "公式アカウントX：紹介", "x_post", false],
  ["posting", "店舗02：紹介", "o2_post", false],
  ["posting", "お店O2：紹介", "o2_post", false],
  ["posting", "公式アカウントＯ２ストーリー：紹介", "o2_story", false],
  ["posting", "本人X（店舗用）：紹介", "x_post", false],
  ["posting", "店舗ストーリー：紹介", "o2_story", false],
  ["posting", "バナー：本人X", "x_post", false],
  ["posting", "本人Xバナー：告知", "x_post", false],
  ["posting", "HPニュース：紹介", "x_post", false],
  ["posting", "エスたまニュース：本人02", "o2_post", false],
  ["posting", "LINE：紹介", "o2_post", false],
  ["posting", "ＬＩＮＥ：紹介", "o2_story", false],
  ["posting", "line：紹介", "x_post", false],
  ["posting", "Line：紹介", "o2_post", false],
  ["posting", "ｌｉｎｅ：紹介", "o2_story", false],
  ["posting", "X：店舗のバナー素材とニュースやLINEの文言を使う", "", true],
  ["posting", "X:お店と公式アカウントの説明", "x_post", true],
  ["posting", "02投稿：HPニュースを紹介", "", true],
  ["posting", "Ｏ2ストーリー：バナー素材を使う", "", true],
  ["posting", "ストーリー：店舗の紹介", "o2_story", true],
  ["posting", "告知", "x_post", true],
  ["posting", "告知", "o2_post", true],
  ["posting", "", "o2_story", true],
  ["posting", "X", "", true],
  ["posting", "Ｘ投稿：告知", "", true],
  ["posting", "本人の X投稿：告知", "", true],
  ["posting", "セラピストＸ（初回）：紹介", "", true],
  ["posting", "個人のX (初回)：紹介", "future_channel", true],
  ["posting", "\t X ：告知", "", true],
  ["posting", "　Ｘ投稿：告知", "", true],
  ["posting", "本人02：告知", "", true],
  ["posting", "個人の０2投稿：告知", "", true],
  ["posting", "セラピストO2ストーリー：告知", "", true],
  ["posting", "本人Ｏ2：告知", "future_channel", true],
  ["posting", "Ｏ２ストーリー：告知", "", false],
  ["posting", "本人O２投稿：告知", "future_channel", false],
  ["posting", "Ｏ２ストーリー：告知", "o2_story", true],
  ["posting", "投稿：本文の本人Xや02は名前ではない", "", false],
  ["posting", "店舗準備：本文の本人X", "future_channel", false],
  ["posting", "告知", "future_channel", false],
  ["posting", "ストーリー：紹介", "", false],
  ["posting", "X運用：紹介", "", false],
  ["posting", "Xylophone：紹介", "", false],
  ["posting", "紹介X：告知", "", false],
  ["posting", "Oasis：紹介", "", false],
  ["posting", "", "", false],
];

test("actual PGlite: classifier, filtered portal, per-cast progress, security, reports, push and migration idempotence", {
  skip: !pglitePath && "Install @electric-sql/pglite in an isolated test directory to run SQL integration checks",
  timeout: 120_000,
}, async t => {
  const { PGlite } = await import(pathToFileURL(pglitePath!).href);
  for (const existingPrivateSchema of [false, true]) {
    await t.test(existingPrivateSchema ? "existing private schema and client usage" : "new private schema", async () => {
      const db = new PGlite();
      const query = (sql: string, params: unknown[] = []) => db.query(sql, params);
      const scalar = async <T = unknown>(sql: string, params: unknown[] = []) => Object.values((await query(sql, params)).rows[0])[0] as T;
      const denied = async (sql: string, params: unknown[] = [], code = "42501") => {
        await assert.rejects(() => query(sql, params), (error: unknown) => {
          assert.ok(error && typeof error === "object" && "code" in error);
          assert.equal(error.code, code);
          return true;
        });
      };
      const complete = (token: string, id: number, done: boolean) => scalar<boolean>("select public.complete_therapist_promotion_task($1,$2,$3)", [token, u(id), done]);
      const schedule = (token: string) => scalar<TherapistPromotionPlan[]>("select public.get_therapist_promotion_schedule($1)", [token]);
      const calls = () => scalar<number>("select count(*)::integer from net.calls");
      const row = (cast = 3, task = 30) => scalar<CompletionRow>("select to_jsonb(tc) from public.therapist_promotion_task_completions tc where cast_id=$1 and task_id=$2", [u(cast), u(task)]);
      const manager = () => db.exec(`set role authenticated; set test.uid='${u(900)}'; set test.store='${u(1)}'`);
      try {
        // Bootstrap adapted from /tmp/therapist-promotion-sql-check/check.mjs.
        // All notification IO is a local SQL stub: no real network or production.
        await db.exec(`
          create role anon; create role authenticated; create role service_role bypassrls;
          create schema auth; create schema net; create schema vault;
          grant usage on schema public, auth to anon, authenticated, service_role;
          create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
          create function public.can_manage_store(p uuid) returns boolean language sql stable as $$
            select auth.uid() is not null and p = nullif(current_setting('test.store', true), '')::uuid
          $$;
          create table public.stores (id uuid primary key);
          create table public.casts(id uuid primary key, store_id uuid not null references public.stores(id), name text, access_token text unique, is_active boolean not null default true);
          create table public.promotion_plans(id uuid primary key, store_id uuid not null references public.stores(id), title text, therapist_label text, description text, starts_on date, ends_on date, is_active boolean not null default true, cast_ids uuid[] not null default '{}', created_at timestamptz default now());
          -- Existing live channel_key; no new ownership/reward column is needed.
          create table public.promotion_plan_tasks(id uuid primary key, store_id uuid not null references public.stores(id), plan_id uuid not null references public.promotion_plans(id), task_type text, channel_key text, scheduled_on date, group_label text, label text, is_completed boolean default false, completed_at timestamptz, sort_order integer default 0, created_at timestamptz default now());
          create table public.promotion_plan_channels(id uuid primary key, store_id uuid not null references public.stores(id), plan_id uuid not null references public.promotion_plans(id), channel_key text, channel_label text, placement_count integer, size_spec text, sort_order integer default 0, is_enabled boolean default true, created_at timestamptz default now(), unique(plan_id,channel_key));
          create table public.push_subscriptions(id uuid primary key, store_id uuid references public.stores(id), topics text[] not null default array['live_only', 'web_booking']);
          create table vault.decrypted_secrets(name text, decrypted_secret text);
          insert into vault.decrypted_secrets values ('push_notify_internal_secret', 'fixture-secret');
          create table net.calls(id bigint generated always as identity, url text, headers jsonb, body jsonb);
          create function net.http_post(url text, body jsonb default '{}'::jsonb, params jsonb default '{}'::jsonb, headers jsonb default '{}'::jsonb, timeout_milliseconds integer default 1000) returns bigint language plpgsql as $$
            declare v bigint;
            begin
              if current_setting('test.push_failure', true) = 'yes' then raise exception 'fixture unavailable'; end if;
              insert into net.calls(url, headers, body) values (url, headers, body) returning id into v;
              return v;
            end;
          $$;
          create function public.trg_push_notify() returns trigger language plpgsql as $$ begin return new; end $$;
          create function public.get_therapist_promotion_schedules(text) returns text language sql as $$ select 'existing-live-signature' $$;
          create function public.get_therapist_promotion_channels(text) returns text language sql as $$ select 'existing-live-channels' $$;
          insert into public.stores values ('${u(1)}'), ('${u(2)}');
          insert into public.casts(id,store_id,name,access_token,is_active) values
            ('${u(3)}','${u(1)}','こよみ','token-a',true),
            ('${u(4)}','${u(1)}','れいな','token-b',true),
            ('${u(5)}','${u(2)}','こよみ','token-other',true),
            ('${u(6)}','${u(1)}','退店','token-inactive',false),
            ('${u(7)}','${u(1)}','未割当','token-none',true);
          insert into public.promotion_plans(id,store_id,title,therapist_label,description,starts_on,ends_on,cast_ids,is_active) values
            ('${u(10)}','${u(1)}','過去の割当企画','こよみ＆れいな','店舗専用のバナーとLINEの準備指示','2020-01-01','2020-01-10',array['${u(3)}','${u(4)}']::uuid[],true),
            ('${u(11)}','${u(1)}','旧ペア企画','こよみ ＆ れいな',null,'2020-02-01','2020-02-10','{}',true),
            ('${u(12)}','${u(1)}','無関係','別の人',null,null,null,'{}',true),
            ('${u(13)}','${u(1)}','無効企画','こよみ',null,null,null,array['${u(3)}']::uuid[],false),
            ('${u(14)}','${u(2)}','別店舗企画','こよみ',null,null,null,array['${u(3)}']::uuid[],true),
            ('${u(15)}','${u(1)}','明示対象が優先','こよみ',null,null,null,array['${u(4)}']::uuid[],true),
            ('${u(16)}','${u(1)}','部分一致不可','こよみな',null,null,null,'{}',true),
            ('${u(17)}','${u(1)}','旧完全一致','こよみ',null,null,null,'{}',true),
            ('${u(18)}','${u(1)}','タスク未登録','こよみ',null,null,null,array['${u(3)}']::uuid[],true),
            ('${u(19)}','${u(1)}','店舗のみ','こよみ',null,null,null,array['${u(3)}']::uuid[],true),
            ('${u(20)}','${u(1)}','準備のみ','こよみ',null,null,null,array['${u(3)}']::uuid[],true);
          insert into public.push_subscriptions values ('${u(300)}','${u(1)}',array['web_booking']), ('${u(301)}','${u(2)}',array['promotion_task']);
        `);
        if (existingPrivateSchema) {
          await db.exec(`create schema private; grant usage on schema private to anon, authenticated, service_role;
            alter default privileges in schema private grant execute on functions to anon, authenticated, service_role;
            create function private.promotion_task_kind(text,text) returns text language plpgsql as $$ begin raise exception 'old classifier must not be called'; end $$;`);
        }
        const taskFixtures: [number, number, number, string | null, string | null, string | null][] = [
          [30, 1, 10, "posting", null, "X：店舗のバナー素材とニュースを紹介"],
          [31, 1, 10, "preparation", "x_post", "素材準備"],
          [32, 2, 10, "posting", "x_post", "X：異店舗タスク"],
          [33, 1, 11, "posting", null, "02投稿：旧ペア告知"],
          [34, 2, 14, "posting", "x_post", "X：別店舗計画"],
          [35, 1, 13, "posting", "x_post", "X：無効計画"],
          [36, 1, 12, "posting", "x_post", "X：未割当"],
          [37, 1, 15, "posting", "x_post", "X：明示対象のみ"],
          [38, 1, 16, "posting", "x_post", "X：部分一致不可"],
          [39, 1, 10, "posting", "hp_top_banner", "本人X：HPバナー"],
          [40, 1, 10, "posting", "estama_top_banner", "本人X：魂バナー"],
          [41, 1, 10, "posting", "hp_news", "本人X：HPニュース"],
          [42, 1, 10, "posting", "estama_news", "本人X：魂ニュース"],
          [43, 1, 10, "posting", "line_official", "本人X：LINE"],
          [44, 1, 10, "posting", "x_post", "店舗X：告知"],
          [45, 1, 10, "posting", "o2_post", "お店O2：告知"],
          [46, 1, 10, "posting", "o2_story", "公式アカウント02ストーリー：告知"],
          [47, 1, 10, "posting", "x_post", "バナー：素材"],
          [48, 1, 10, "posting", "x_post", "HPニュース：告知"],
          [49, 1, 10, "posting", "o2_post", "LINE：告知"],
          [50, 1, 10, "posting", "o2_story", "ＬＩＮＥ：告知"],
          [51, 1, 10, "posting", "x_post", "X投稿：本人の告知"],
          [52, 1, 10, "posting", "x_post", "セラピストＸ：ニュース本文を紹介"],
          [53, 1, 10, "posting", "future_channel", "紹介：本文の本人Xは判定対象外"],
          [54, 1, 10, "posting", "future_channel", "本人X：告知"],
          [55, 1, 10, "posting", "o2_post", "02投稿：バナーを使って告知"],
          [56, 1, 10, "posting", "o2_story", "02ストーリー：お店の紹介"],
          [57, 1, 10, "posting", "x_post", null],
          [58, 1, 10, null, "x_post", "X：種類なし"],
          [59, 1, 10, "posting", null, null],
          [60, 1, 19, "posting", "x_post", "店舗X：店舗のみ"],
          [61, 1, 17, "posting", null, "本人のX投稿：旧完全一致"],
          [62, 1, 10, "posting", null, "　Ｏ2ストーリー：告知"],
          [63, 1, 20, "preparation", null, "X：準備のみ"],
          [64, 1, 10, "posting", "disabled_personal", "個人X：告知"],
        ];
        for (const [id, store, plan, type, channel, label] of taskFixtures) {
          await query(`insert into public.promotion_plan_tasks(id,store_id,plan_id,task_type,channel_key,label,scheduled_on,sort_order,is_completed)
            values ($1,$2,$3,$4,$5,$6,'2020-01-02',$7,true)`, [u(id), u(store), u(plan), type, channel, label, id]);
        }
        const channels = ["hp_top_banner", "estama_top_banner", "hp_news", "estama_news", "line_official", "x_post", "o2_post", "o2_story", "unused_personal", "disabled_personal"];
        for (const [i, key] of channels.entries()) {
          await query(`insert into public.promotion_plan_channels(id,store_id,plan_id,channel_key,channel_label,placement_count,size_spec,sort_order,is_enabled)
            values ($1,$2,$3,$4,$4,29,'fixture-size',$5,$6)`, [u(200 + i), u(1), u(10), key, i, key !== "disabled_personal"]);
        }
        await query(`insert into public.promotion_plan_channels(id,store_id,plan_id,channel_key,channel_label,placement_count)
          values ($1,$2,$3,'future_channel','異店舗',29)`, [u(220), u(2), u(10)]);
        await db.exec(previous);
        // Historic store/preparation completions already saved before the fix must
        // survive, but no longer appear as therapist reports or be markable.
        for (const [i, task] of [31, 39, 44, 45, 46].entries()) {
          await query(`insert into public.therapist_promotion_task_completions(id,store_id,cast_id,task_id,is_completed,completed_at)
            values ($1,$2,$3,$4,true,'2020-01-03')`, [u(400 + i), u(1), u(3), u(task)]);
        }
        await db.exec(`update public.push_subscriptions set topics=array['web_booking'] where id='${u(300)}';
          alter table public.push_subscriptions alter column topics set default array['live_only','custom_preference'];`);
        const historyBefore = await scalar("select jsonb_agg(to_jsonb(tc) order by id) from public.therapist_promotion_task_completions tc");
        const preferencesBefore = await scalar("select jsonb_agg(to_jsonb(s) order by id) from public.push_subscriptions s");
        const tasksBefore = await scalar("select jsonb_agg(to_jsonb(t) order by id) from public.promotion_plan_tasks t");
        const defaultBefore = await scalar("select pg_get_expr(d.adbin,d.adrelid) from pg_catalog.pg_attrdef d join pg_catalog.pg_attribute a on a.attrelid=d.adrelid and a.attnum=d.adnum where d.adrelid='public.push_subscriptions'::regclass and a.attname='topics'");
        const originalPushCount = await calls();
        await db.exec(migration);
        await db.exec(migration);
        assert.deepEqual(await scalar("select jsonb_agg(to_jsonb(tc) order by id) from public.therapist_promotion_task_completions tc"), historyBefore);
        assert.deepEqual(await scalar("select jsonb_agg(to_jsonb(s) order by id) from public.push_subscriptions s"), preferencesBefore);
        assert.deepEqual(await scalar("select jsonb_agg(to_jsonb(t) order by id) from public.promotion_plan_tasks t"), tasksBefore);
        assert.equal(await scalar("select pg_get_expr(d.adbin,d.adrelid) from pg_catalog.pg_attrdef d join pg_catalog.pg_attribute a on a.attrelid=d.adrelid and a.attnum=d.adnum where d.adrelid='public.push_subscriptions'::regclass and a.attname='topics'"), defaultBefore);
        assert.equal(await calls(), originalPushCount);
        assert.equal(await scalar("select public.get_therapist_promotion_schedules('anything')"), "existing-live-signature");
        assert.equal(await scalar("select public.get_therapist_promotion_channels('anything')"), "existing-live-channels");
        assert.equal(await scalar("select count(*)::integer from pg_catalog.pg_trigger where tgname='therapist_promotion_task_completions_push_notify'"), 1);
        const classifierMeta = (await query("select provolatile,proisstrict,prosecdef,proconfig from pg_catalog.pg_proc where oid='private.is_therapist_promotion_task(text,text,text)'::regprocedure")).rows[0];
        assert.equal(classifierMeta.provolatile, "i");
        assert.equal(classifierMeta.proisstrict, true);
        assert.equal(classifierMeta.prosecdef, false);
        assert.ok(classifierMeta.proconfig.some((entry: string) => entry.startsWith("search_path=")));
        for (const [type, label, channel, expected] of matrix) {
          assert.equal(await scalar("select private.is_therapist_promotion_task($1,$2,$3)", [type, label, channel]), expected, JSON.stringify({ type, label, channel }));
        }
        for (const args of [[null, "X", ""], ["posting", null, "x_post"], ["posting", "X", null]]) {
          assert.equal(await scalar("select private.is_therapist_promotion_task($1,$2,$3)", args), null, "STRICT must return null for null input");
        }
        for (const role of ["anon", "authenticated", "service_role"]) {
          assert.equal(await scalar("select has_function_privilege($1,'private.is_therapist_promotion_task(text,text,text)','execute')", [role]), false);
          await db.exec(`set role ${role}`);
          await denied("select private.is_therapist_promotion_task('posting','X','')");
          await db.exec("reset role");
        }
        await db.exec("set role anon");
        for (const token of [null, "", "   ", "bogus", "token-inactive", " token-a "]) {
          await denied("select public.get_therapist_promotion_schedule($1)", [token]);
          for (const done of [true, false]) await denied("select public.complete_therapist_promotion_task($1,$2,$3)", [token, u(30), done]);
        }
        const plansA = await schedule("token-a");
        const plansB = await schedule("token-b");
        assert.deepEqual(new Set(plansA.map((p) => p.id)), new Set([10, 11, 17].map(u)), "exclude store-only, preparation-only, empty, inactive and unassigned plans");
        assert.deepEqual(new Set(plansB.map((p) => p.id)), new Set([10, 11, 15].map(u)));
        const personalTaskIds = [30, 51, 52, 54, 55, 56, 57, 62, 64].map(u);
        const pairA = plansA.find((p) => p.id === u(10));
        const pairB = plansB.find((p) => p.id === u(10));
        assert.deepEqual(pairA.tasks.map((task) => task.id), personalTaskIds);
        assert.deepEqual(pairB.tasks.map((task) => task.id), personalTaskIds, "both pair tokens receive the same personal tasks");
        assert.equal(pairA.description, null);
        assert.equal(pairA.title, "過去の割当企画");
        assert.equal(pairA.startsOn, "2020-01-01");
        assert.equal(pairA.endsOn, "2020-01-10");
        assert.ok(pairA.tasks.every((task) => !task.isCompleted && !task.storeCompleted && task.completedAt === null));
        assert.equal(pairA.tasks.find((task) => task.id === u(30)).channelKey, null);
        assert.equal(pairA.tasks.find((task) => task.id === u(51)).channelKey, "x_post");
        assert.deepEqual(pairA.channels.map((channel) => [channel.key, channel.count, channel.sizeSpec]), [
          ["x_post", 3, "fixture-size"], ["o2_post", 1, "fixture-size"], ["o2_story", 1, "fixture-size"],
        ], "mixed channel counts use only visible tasks, never shared placement_count=29");
        assert.deepEqual(plansA.find((p) => p.id === u(11)).tasks.map((task) => task.id), [u(33)]);
        assert.deepEqual(await schedule("token-none"), []);
        assert.deepEqual(await schedule("token-other"), []);
        for (const id of [31, 32, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 53, 58, 59, 60, 63, 999]) {
          for (const done of [true, false]) await denied("select public.complete_therapist_promotion_task($1,$2,$3)", ["token-a", u(id), done]);
        }
        for (const token of ["token-other", "token-none"]) {
          for (const done of [true, false]) await denied("select public.complete_therapist_promotion_task($1,$2,$3)", [token, u(30), done]);
        }
        await denied("select public.complete_therapist_promotion_task('token-a',$1,null)", [u(30)], "22023");
        await denied("select id from public.therapist_promotion_task_completions limit 1");
        await denied("select public.get_therapist_promotion_reports($1)", [u(1)]);
        await db.exec("reset role");
        await manager();
        assert.deepEqual(await scalar<TherapistPromotionReport[]>("select public.get_therapist_promotion_reports($1)", [u(1)]), []);
        assert.deepEqual(await scalar<TherapistPromotionReport[]>("select public.get_therapist_promotion_reports($1,true)", [u(1)]), []);
        for (let n = 400; n <= 404; n++) await denied("select public.mark_therapist_promotion_report_seen($1)", [u(n)]);
        await denied("insert into public.therapist_promotion_task_completions(store_id,cast_id,task_id) values ($1,$2,$3)", [u(1), u(3), u(51)]);
        await denied("update public.therapist_promotion_task_completions set is_completed=false where id=$1", [u(402)]);
        await denied("delete from public.therapist_promotion_task_completions where id=$1", [u(402)]);
        await db.exec("reset role");
        // Even trusted legacy writers changing store rows cannot schedule new push.
        await db.exec(`update public.push_subscriptions set topics=array['promotion_task'] where id='${u(300)}';
          update public.therapist_promotion_task_completions set is_completed=false where id in ('${u(401)}','${u(402)}','${u(403)}','${u(404)}');
          update public.therapist_promotion_task_completions set is_completed=true where id in ('${u(401)}','${u(402)}','${u(403)}','${u(404)}');`);
        await query("insert into public.therapist_promotion_task_completions(store_id,cast_id,task_id,is_completed,completed_at) values ($1,$2,$3,true,now())", [u(1), u(4), u(43)]);
        assert.equal(await calls(), originalPushCount, "historic store updates and new store reports cannot notify");
        await db.exec("set role anon");
        assert.equal(await complete("token-a", 30, true), true);
        await db.exec("reset role");
        const first = await row();
        assert.equal(await calls(), originalPushCount + 1);
        const call = (await query("select url,headers,body from net.calls order by id desc limit 1")).rows[0];
        assert.equal(call.body.id, first.id);
        assert.equal(call.body.event, "promotion_task");
        assert.equal(call.headers["x-push-notify-secret"], "fixture-secret");
        assert.match(call.headers.Authorization, /^Bearer eyJ/);
        await manager();
        const reports = await scalar<TherapistPromotionReport[]>("select public.get_therapist_promotion_reports($1,true)", [u(1)]);
        assert.equal(reports.length, 1);
        assert.equal(reports[0].taskId, u(30));
        assert.equal(reports[0].castName, "こよみ");
        assert.equal(await scalar("select public.mark_therapist_promotion_report_seen($1)", [first.id]), true);
        await db.exec("reset role");
        const seen = await row();
        assert.ok(seen.admin_seen_at);
        await manager();
        assert.deepEqual(await scalar<TherapistPromotionReport[]>("select public.get_therapist_promotion_reports($1,true)", [u(1)]), []);
        assert.equal((await scalar<TherapistPromotionReport[]>("select public.get_therapist_promotion_reports($1)", [u(1)])).length, 1);
        await scalar("select public.mark_therapist_promotion_report_seen($1)", [first.id]);
        await db.exec("reset role");
        assert.deepEqual(await row(), seen, "mark seen is idempotent");
        await db.exec("set role anon");
        assert.equal(await complete("token-a", 30, true), true);
        assert.equal((await schedule("token-b")).find((p) => p.id === u(10)).tasks.find((task) => task.id === u(30)).isCompleted, false);
        await db.exec("reset role");
        assert.deepEqual(await row(), seen, "duplicate completion preserves completion/read timestamps");
        assert.equal(await calls(), originalPushCount + 1, "one personal report schedules exactly one notification");
        await db.exec("set role anon");
        assert.equal(await complete("token-b", 30, true), true);
        assert.equal(await complete("token-a", 30, false), false);
        const stateA = (await schedule("token-a")).find((p) => p.id === u(10)).tasks.find((task) => task.id === u(30));
        const stateB = (await schedule("token-b")).find((p) => p.id === u(10)).tasks.find((task) => task.id === u(30));
        assert.equal(stateA.isCompleted, false);
        assert.equal(stateA.completedAt, null);
        assert.equal(stateB.isCompleted, true);
        await db.exec("reset role");
        const undone = await row();
        assert.equal(undone.admin_seen_at, seen.admin_seen_at);
        assert.equal(await calls(), originalPushCount + 2, "pair member completion is independent; undo does not notify");
        await db.exec("set role anon");
        await complete("token-a", 30, false);
        await db.exec("reset role");
        assert.deepEqual(await row(), undone, "duplicate undo does not update");
        await db.exec("set role anon");
        await complete("token-a", 30, true);
        await db.exec("reset role");
        const resubmitted = await row();
        assert.equal(resubmitted.id, first.id);
        assert.equal(resubmitted.admin_seen_at, null);
        assert.ok(new Date(resubmitted.completed_at).getTime() > new Date(first.completed_at).getTime());
        assert.equal(await calls(), originalPushCount + 3);
        await db.exec("set role anon");
        await complete("token-a", 33, true); // exact legacy pair fallback
        await complete("token-b", 33, true);
        await complete("token-a", 61, true); // exact legacy single fallback
        await complete("token-b", 37, true); // explicit assignment overrides label
        await db.exec("reset role");
        assert.equal(await calls(), originalPushCount + 7);
        // Preserve the old inconsistent-store rejection, including false updates.
        await query("insert into public.therapist_promotion_task_completions(store_id,cast_id,task_id,is_completed,completed_at) values ($1,$2,$3,true,now())", [u(2), u(4), u(51)]);
        await db.exec("set role anon");
        for (const done of [true, false]) await denied("select public.complete_therapist_promotion_task('token-b',$1,$2)", [u(51), done]);
        await db.exec("reset role");
        await manager();
        await db.exec(`set test.store='${u(2)}'`);
        assert.deepEqual(await scalar<TherapistPromotionReport[]>("select public.get_therapist_promotion_reports($1)", [u(2)]), []);
        await denied("select public.get_therapist_promotion_reports($1)", [u(1)]);
        await denied("select public.mark_therapist_promotion_report_seen($1)", [first.id]);
        await db.exec("reset role; set test.uid=''");
        await denied("select public.get_therapist_promotion_reports($1)", [u(1)]);
        await db.exec("set role service_role");
        await denied("select public.get_therapist_promotion_reports($1)", [u(1)]);
        await db.exec("reset role");
        // No matching subscriber and a failing local transport must not lose data.
        await db.exec(`update public.push_subscriptions set topics=array['web_booking'] where store_id='${u(1)}'; set role anon`);
        await complete("token-a", 30, false);
        await complete("token-a", 30, true);
        await db.exec("reset role");
        assert.equal(await calls(), originalPushCount + 7);
        await db.exec(`update public.push_subscriptions set topics=array['promotion_task'] where store_id='${u(1)}'; set test.push_failure='yes'; set role anon`);
        await complete("token-a", 30, false);
        await complete("token-a", 30, true);
        await db.exec("reset role; set test.push_failure='no'");
        assert.equal((await row()).is_completed, true);
        assert.equal(await calls(), originalPushCount + 7);
        // Reapplying the fix after usage must not alter saved progress or topics.
        const finalHistory = await scalar("select jsonb_agg(to_jsonb(tc) order by id) from public.therapist_promotion_task_completions tc");
        await db.exec(migration);
        assert.deepEqual(await scalar("select jsonb_agg(to_jsonb(tc) order by id) from public.therapist_promotion_task_completions tc"), finalHistory);
        assert.equal(await calls(), originalPushCount + 7);
        assert.equal(await scalar("select count(*)::integer from public.therapist_promotion_task_completions where id=any($1::uuid[])", [[400, 401, 402, 403, 404].map(u)]), 5, "historic store/preparation records remain stored");
      } finally {
        await db.close();
      }
    });
  }
});
