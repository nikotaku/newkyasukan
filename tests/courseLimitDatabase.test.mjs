import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const migration = readFileSync(new URL('../supabase/migrations/20261113064838_enforce_new_customer_course_limit.sql', import.meta.url), 'utf8');
const store = '00000000-0000-0000-0000-000000000001';
const otherStore = '00000000-0000-0000-0000-000000000002';
const cast = '00000000-0000-0000-0000-000000000003';
const unlimited = '00000000-0000-0000-0000-000000000004';
const schema = `
create role anon; create role authenticated;
create schema private;
create function public.norm_phone(text) returns text language sql immutable as $$ select regexp_replace($1, '[^0-9]', '', 'g') $$;
create function private.norm_cast_name(text) returns text language sql immutable as $$ select $1 $$;
create function private.business_minutes(time) returns integer language sql immutable as $$ select extract(hour from $1)::int*60 + extract(minute from $1)::int $$;
create table public.casts(id uuid, store_id uuid, name text, new_customer_max_minutes int, is_active boolean default true, is_estama_dummy boolean default false, created_at timestamptz default now());
create table public.reservations(id uuid default gen_random_uuid(), cast_id uuid, store_id uuid, customer_phone text, duration int, reservation_date date, start_time time, status text, booking_origin text);
create table public.shifts(cast_id uuid, store_id uuid, shift_date date, start_time time, end_time time, break_start time, break_end time, status text, approval_status text);
create table public.external_cast_profiles(cast_id uuid, provider text, remote_name text);
create table public.estama_reservation_requests(id uuid, store_id uuid, cast_name text, is_free boolean, hope_date date, hope_time time, course_label text, course_minutes int, customer_phone text, visit_kind text, reservation_id uuid);
insert into public.casts(id,store_id,name,new_customer_max_minutes) values ('${cast}','${store}','Fixture therapist',80),('${unlimited}','${store}','Unlimited',null);
-- Same-store repeat, other-store only, and future completed records.
insert into public.reservations(cast_id,store_id,customer_phone,duration,reservation_date,start_time,status) values
('${cast}','${store}','09011111111',80,'2020-01-01','12:00','completed'),
('${cast}','${otherStore}','09022222222',80,'2020-01-01','12:00','completed'),
('${cast}','${store}','09033333333',80,'2099-01-01','12:00','completed');
insert into public.shifts(cast_id,store_id,shift_date,start_time,end_time,status) values ('${cast}','${store}','2030-01-01','10:00','23:00','confirmed');
`;

test('course limits enforce store-specific first visits at the database boundary', async (t) => {
  const db = new PGlite();
  await db.exec(schema);
  await db.exec(migration);
  const insert = (duration, phone = '09099999999', castId = cast, origin = 'web_form', status = 'confirmed') => db.query(
    `insert into public.reservations(cast_id,store_id,customer_phone,duration,reservation_date,start_time,status,booking_origin)
     values ($1,$2,$3,$4,'2030-01-01','12:00',$5,$6) returning id`, [castId,store,phone,duration,status,origin]);
  const rejected = (promise) => assert.rejects(promise, error => error.code === '23514' && error.detail === 'NEW_CUSTOMER_COURSE_LIMIT');
  await t.test('80 minutes is accepted, 81/100/110 rejected across all booking origins', async () => {
    for (const origin of ['web_form','cast_form','staff']) {
      await insert(80, undefined, cast, origin);
      for (const duration of [81,100,110]) await rejected(insert(duration,undefined,cast,origin));
    }
  });
  await t.test('only completed visits at this store exempt the limit; normalized phones work', async () => {
    await insert(110,'090-1111-1111');
    await rejected(insert(110,'09022222222'));
    await rejected(insert(110,'09033333333'));
    await rejected(insert(110,null));
  });
  await t.test('unlimited therapists and cancellation are supported', async () => {
    await insert(110,undefined,unlimited);
    const {rows:[row]} = await insert(110,undefined,cast,'staff','cancelled');
    await rejected(db.query("update public.reservations set status='confirmed' where id=$1",[row.id]));
  });
  await t.test('duration and cast changes cannot bypass the guard, ordinary completion works', async () => {
    const {rows:[row]}=await insert(80);
    await rejected(db.query('update public.reservations set duration=110 where id=$1',[row.id]));
    await db.query("update public.reservations set status='completed' where id=$1",[row.id]);
    const {rows:[long]}=await insert(110,undefined,unlimited);
    await rejected(db.query('update public.reservations set cast_id=$1 where id=$2',[cast,long.id]));
  });
  await t.test('Estama 110/100 uses 110, prioritizes limit, ignores unverified repeat label', async () => {
    const {rows:[row]} = await db.query(`select private.check_estama_request(jsonb_populate_record(null::public.estama_reservation_requests,
      jsonb_build_object('store_id',$1::text,'cast_name','Fixture therapist','is_free',false,
        'hope_date','2030-01-01','hope_time','12:00','course_label','【会員限定】110分リラックスプラン',
        'course_minutes',100,'customer_phone','09022222222','visit_kind','リピート予約'))) result`,[store]);
    assert.equal(row.result.status,'course_limit');
    assert.match(row.result.note,/110分/);
    const {rows:[minutes]}=await db.query("select private.estama_effective_course_minutes('【会員限定】70分プラン',60) minutes");
    assert.equal(minutes.minutes,70);
  });
  await db.close();
});
