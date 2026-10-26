import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const admin = '00000000-0000-0000-0000-000000000001'
const member = '00000000-0000-0000-0000-000000000002'
const other = '00000000-0000-0000-0000-000000000003'

async function database() {
  const db = new PGlite()
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as
      $$ select jsonb_build_object('email',(select email from auth.users where id=auth.uid())) $$;
    grant usage on schema auth to authenticated,anon,service_role;
    grant execute on all functions in schema auth to authenticated,anon,service_role;
    create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated;
    grant all on storage.objects to authenticated;
  `)
  for (const file of ['20261016090000_booking_requests.sql', '20261021100000_family_bookings.sql', '20261021120000_family_content.sql']) {
    await db.exec(await readFile(new URL(`../../supabase/migrations/${file}`, import.meta.url), 'utf8'))
  }
  await db.exec(`
    insert into public.admin_allowlist values('admin@example.test');
    insert into auth.users values
      ('${admin}','admin@example.test',now()),
      ('${member}','member@example.test',now()),
      ('${other}','other@example.test',now());
    create or replace function public.family_today() returns date language sql stable as $$ select date '2026-10-21' $$;
    update public.house_settings set rate_cents=1000,transfer_instructions='Test bank instructions';
  `)
  await asUser(db, admin)
  await db.exec(`select public.save_my_profile('Admin','Test','helene');`)
  await asUser(db, member)
  await db.exec(`select public.save_my_profile('Member','Test','gustave');`)
  await asUser(db, other)
  await db.exec(`select public.save_my_profile('Other','Test','helene');`)
  return db
}

async function asUser(db, id) {
  await db.query(`select set_config('request.jwt.claim.sub',$1,false)`, [id])
}
async function submit(db, { start = '2026-11-20', end = '2026-11-23', count = 10, mode = 'open' } = {}) {
  const result = await db.query(`select public.submit_booking_request('Guest','Test',$1::date,$2::date,$3,'12:00','12:00',null,$4) as id`, [start, end, count, mode])
  return result.rows[0].id
}
async function approve(db, id) {
  await asUser(db, admin)
  await db.query('select public.owner_confirm_booking($1)', [id])
}
async function booking(db, id) {
  return (await db.query('select * from public.booking_requests where id=$1', [id])).rows[0]
}

test('migration chain, verified admins and owner-only public RPCs', async () => {
  const db = await database()
  try {
    assert.equal((await db.query('select count(*)::integer as count from public.site_owners')).rows[0].count, 1)
    await asUser(db, member)
    await assert.rejects(db.exec(`select public.owner_save_family_settings(2026,'gustave',1000,'bank')`), /owner_required/)
    await db.exec('set role authenticated')
    await assert.rejects(db.exec('select public.process_family_bookings()'), /permission denied/)
    await assert.rejects(db.exec('select public.claim_site_owner()'), /permission denied/)
    await assert.rejects(db.exec(`update public.site_owners set user_id='${member}'`), /permission denied/)
    await assert.rejects(db.exec(`select public.save_my_profile('Member','Test','helene')`), /branch_change_requires_admin/)
    await db.exec('reset role')
    await db.exec(`update auth.users set email_confirmed_at=null where id='${member}'`)
    await assert.rejects(submit(db), /verified_email_required/)
  } finally { await db.close() }
})

test('six calendar months, year boundaries and J-21 delayed confirmation', async () => {
  const db = await database()
  try {
    await asUser(db, member)
    await assert.rejects(submit(db, { start: '2027-04-21', end: '2027-04-22' }), /stay_outside_six_months/)
    const limit = await submit(db, { start: '2027-04-20', end: '2027-04-21' })
    assert.ok(limit)
    assert.equal((await db.query(`select public.family_year(date '2026-06-30') as y`)).rows[0].y, 2025)
    assert.equal((await db.query(`select public.family_year(date '2026-07-01') as y`)).rows[0].y, 2026)
    const id = await submit(db)
    await approve(db, id)
    assert.equal((await booking(db, id)).status, 'approved')
    assert.equal((await db.query('select count(*)::integer as n from public.email_outbox')).rows[0].n, 0)
    await db.exec(`create or replace function public.family_today() returns date language sql stable as $$ select date '2026-10-29' $$`)
    await db.exec('select public.process_family_bookings()')
    assert.equal((await booking(db, id)).status, 'approved')
    await db.exec(`create or replace function public.family_today() returns date language sql stable as $$ select date '2026-10-30' $$`)
    await db.exec('select public.process_family_bookings(); select public.process_family_bookings();')
    assert.equal((await booking(db, id)).status, 'confirmed')
    assert.equal((await db.query(`select count(*)::integer as n from public.email_outbox where kind='confirmation'`)).rows[0].n, 1)
  } finally { await db.close() }
})

test('open groups share capacity by night; exclusive stays and blocks cannot overlap', async () => {
  const db = await database()
  try {
    await asUser(db, other)
    const a = await submit(db, { count: 20 })
    const b = await submit(db, { count: 10, start: '2026-11-22', end: '2026-11-25' })
    const overflow = await submit(db, { count: 1, start: '2026-11-22', end: '2026-11-24' })
    const exclusive = await submit(db, { count: 1, mode: 'exclusive' })
    await approve(db, a)
    await approve(db, b)
    await approve(db, overflow)
    await approve(db, exclusive)
    assert.equal((await booking(db, a)).status, 'confirmed')
    assert.equal((await booking(db, b)).status, 'confirmed')
    assert.equal((await booking(db, overflow)).conflict, true)
    assert.equal((await booking(db, exclusive)).status, 'approved')
    await assert.rejects(db.exec(`select public.owner_add_block('2026-11-22','2026-11-23')`), /occupied_dates_conflict/)
    await asUser(db, other)
    const checkout = await submit(db, { start: '2026-11-25', end: '2026-11-26', mode: 'exclusive', count: 30 })
    await approve(db, checkout)
    assert.equal((await booking(db, checkout)).status, 'confirmed')
  } finally { await db.close() }
})

test('oldest approved request wins and rejected requests are never confirmed', async () => {
  const db = await database()
  try {
    await asUser(db, member)
    const a = await submit(db, { count: 21 })
    const b = await submit(db, { count: 15 })
    const rejected = await submit(db, { start: '2026-12-01', end: '2026-12-03' })
    await approve(db, a)
    await approve(db, b)
    await approve(db, rejected)
    await db.query('select public.owner_reject_booking($1)', [rejected])
    await db.exec(`update public.booking_requests set approved_at=now()-interval '1 hour' where id='${a}'`)
    await db.exec(`create or replace function public.family_today() returns date language sql stable as $$ select date '2026-10-30' $$`)
    await db.exec('select public.process_family_bookings()')
    assert.equal((await booking(db, a)).status, 'confirmed')
    assert.equal((await booking(db, b)).conflict, true)
    assert.equal((await booking(db, rejected)).status, 'rejected')
  } finally { await db.close() }
})

test('payment recap is queued J+1 with integer cents and waits for a validated rate', async () => {
  const db = await database()
  try {
    await asUser(db, other)
    const id = await submit(db, { count: 3 })
    await approve(db, id)
    await db.exec(`create or replace function public.family_today() returns date language sql stable as $$ select date '2026-11-23' $$`)
    await db.exec('select public.process_family_bookings()')
    assert.equal((await db.query(`select count(*)::integer as n from public.email_outbox where kind='payment'`)).rows[0].n, 0)
    await db.exec(`create or replace function public.family_today() returns date language sql stable as $$ select date '2026-11-24' $$`)
    await db.exec('select public.process_family_bookings(); select public.process_family_bookings();')
    const payment = (await db.query(`select payload from public.email_outbox where kind='payment'`)).rows[0].payload
    assert.equal(payment.amount_cents, 9000)
    assert.equal(payment.nights, 3)
    await db.exec(`update public.booking_requests set billing_ready=false,rate_cents=null where id='${id}'; delete from public.email_outbox where kind='payment';`)
    await db.exec('select public.process_family_bookings()')
    assert.equal((await db.query(`select count(*)::integer as n from public.email_outbox where kind='payment'`)).rows[0].n, 0)
    await db.query('select public.owner_validate_booking_rate($1,1200)', [id])
    await db.exec('select public.process_family_bookings()')
    assert.equal((await db.query(`select payload from public.email_outbox where kind='payment'`)).rows[0].payload.amount_cents, 10800)
  } finally { await db.close() }
})

test('private articles and documents require a confirmed email; only admins write', async () => {
  const db = await database()
  try {
    await db.exec(`insert into public.family_articles(slug,title,body) values('test','Private','Private content');`)
    await asUser(db, member)
    await db.exec('set role authenticated')
    assert.equal((await db.query('select * from public.family_articles')).rows.length, 1)
    await assert.rejects(db.exec(`insert into public.family_articles(slug,title,body) values('bad','Bad','Bad')`), /row-level security/)
    await db.exec('reset role')
    await db.exec(`update auth.users set email_confirmed_at=null where id='${member}'`)
    await db.exec('set role authenticated')
    assert.equal((await db.query('select * from public.family_articles')).rows.length, 0)
  } finally { await db.close() }
})

test('email leases prevent duplicate claims and delivery uses an ownership token', async () => {
  const db = await database()
  try {
    await asUser(db, other)
    const id = await submit(db)
    await approve(db, id)
    const batch = await db.query('select * from public.claim_family_emails()')
    assert.equal(batch.rows.length, 1)
    assert.equal((await db.query('select * from public.claim_family_emails()')).rows.length, 0)
    const email = batch.rows[0]
    await assert.rejects(db.query('select public.finish_family_email($1,$2,null)', [email.id, admin]), /email_delivery_lease_lost/)
    await db.query('select public.finish_family_email($1,$2,$3)', [email.id, email.delivery_token, 'Provider unavailable'])
    assert.equal((await db.query('select state from public.email_outbox where id=$1', [email.id])).rows[0].state, 'failed')
    await db.exec(`update public.email_outbox set next_attempt_at=now()-interval '1 minute'`)
    const retry = (await db.query('select * from public.claim_family_emails()')).rows[0]
    assert.equal(retry.id, email.id)
    assert.notEqual(retry.delivery_token, email.delivery_token)
    await db.query('select public.finish_family_email($1,$2,null)', [retry.id, retry.delivery_token])
    assert.equal((await db.query('select state from public.email_outbox where id=$1', [email.id])).rows[0].state, 'sent')
  } finally { await db.close() }
})

test('second administrator needs trusted allowlist and verified email; never auto-claim', async () => {
  const db = await database()
  try {
    await db.exec(`insert into public.admin_allowlist values('second@example.test');
      insert into auth.users values('00000000-0000-0000-0000-000000000004','second@example.test',null);`)
    assert.equal((await db.query('select count(*)::integer as n from public.site_owners')).rows[0].n, 1)
    await db.exec(`update auth.users set email_confirmed_at=now() where email='second@example.test'`)
    assert.equal((await db.query('select count(*)::integer as n from public.site_owners')).rows[0].n, 2)
    await db.exec(`insert into public.admin_allowlist values('third@example.test');
      insert into auth.users values('00000000-0000-0000-0000-000000000005','third@example.test',now());`)
    assert.equal((await db.query('select count(*)::integer as n from public.site_owners')).rows[0].n, 2)
  } finally { await db.close() }
})

test('missing priority, missing profiles and past approved stays fail explicitly', async () => {
  const db = await database()
  try {
    await asUser(db, other)
    await db.exec(`delete from public.member_profiles where user_id='${other}'`)
    await assert.rejects(submit(db), /profile_required/)
    await asUser(db, member)
    const id = await submit(db)
    await asUser(db, admin)
    await db.exec('delete from public.family_priorities')
    await assert.rejects(db.query('select public.owner_confirm_booking($1)', [id]), /priority_not_configured/)
    await db.exec(`insert into public.family_priorities values(2026,'helene')`)
    await approve(db, id)
    await db.exec(`create or replace function public.family_today() returns date language sql stable as $$ select date '2026-11-21' $$`)
    await db.exec('select public.process_family_bookings()')
    assert.equal((await booking(db, id)).status, 'approved')
    assert.equal((await db.query(`select count(*)::integer as n from public.email_outbox where kind='confirmation'`)).rows[0].n, 0)
  } finally { await db.close() }
})
