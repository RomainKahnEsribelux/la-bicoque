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
  for (const file of ['20261016090000_booking_requests.sql', '20261021100000_family_bookings.sql', '20261021120000_family_content.sql', '20261026190000_member_workflows.sql', '20261026191000_invitation_capacity.sql']) {
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
    await asUser(db, admin)
    await assert.rejects(db.exec(`select public.owner_invite_member('third@example.test','admin')`), /administrator_slots_full/)
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

test('invitations require an admin, reserve the second slot and wait for verified email', async () => {
  const db = await database()
  try {
    await asUser(db, member)
    await assert.rejects(db.exec(`select public.owner_invite_member('second@example.test','admin')`), /owner_required/)
    await asUser(db, admin)
    await assert.rejects(db.exec(`select public.owner_invite_member('invalid','admin')`), /invalid_invitation_email/)
    const invitation = (await db.query(`select public.owner_invite_member(' SECOND@example.test ','admin') as id`)).rows[0].id
    await assert.rejects(db.exec(`select public.owner_invite_member('third@example.test','admin')`), /administrator_slots_full/)
    await assert.rejects(db.exec(`select public.owner_invite_member('second@example.test','admin')`), /invitation_already_exists/)
    await db.exec(`insert into auth.users values('00000000-0000-0000-0000-000000000004','second@example.test',null)`)
    assert.equal((await db.query('select count(*)::int as n from public.site_owners')).rows[0].n, 1)
    await db.exec(`update auth.users set email_confirmed_at=now() where email='second@example.test'`)
    assert.equal((await db.query('select count(*)::int as n from public.site_owners')).rows[0].n, 2)
    await assert.rejects(db.query('select public.owner_cancel_invitation($1)', [invitation]), /invitation_not_cancellable/)
  } finally { await db.close() }
})

test('cancelled invitations release slots; existing verified members can become second admin', async () => {
  const db = await database()
  try {
    await asUser(db, admin)
    const invitation = (await db.query(`select public.owner_invite_member('second@example.test','admin') as id`)).rows[0].id
    await db.query('select public.owner_cancel_invitation($1)', [invitation])
    assert.equal((await db.query(`select count(*)::int as n from public.admin_allowlist where email='second@example.test'`)).rows[0].n, 0)
    await db.exec(`select public.owner_invite_member('member@example.test','member')`)
    await db.exec(`select public.owner_invite_member('member@example.test','admin')`)
    await asUser(db, member)
    assert.equal((await db.query('select public.is_site_owner() as owner')).rows[0].owner, true)
    await db.exec('set role authenticated')
    await assert.rejects(db.exec(`insert into public.admin_allowlist values('intruder@example.test')`), /permission denied/)
    await assert.rejects(db.exec(`update public.member_invitations set role='admin'`), /permission denied/)
  } finally { await db.close() }
})

test('member cancellation frees capacity, cancels obsolete mail and rechecks eligible approvals', async () => {
  const db = await database()
  try {
    await asUser(db, other)
    const first = await submit(db, { count: 30 })
    const waiting = await submit(db, { count: 10 })
    await approve(db, first)
    await approve(db, waiting)
    assert.equal((await booking(db, waiting)).conflict, true)
    await asUser(db, member)
    await assert.rejects(db.query('select public.cancel_family_booking($1)', [first]), /booking_request_not_found/)
    await asUser(db, other)
    await db.query('select public.cancel_family_booking($1)', [first])
    await db.query('select public.cancel_family_booking($1)', [first])
    assert.equal((await booking(db, first)).status, 'cancelled')
    assert.equal((await booking(db, waiting)).status, 'confirmed')
    assert.equal((await db.query('select count(*)::int as n from public.occupied_periods where booking_id=$1', [first])).rows[0].n, 0)
    assert.equal((await db.query('select state from public.email_outbox where booking_id=$1', [first])).rows[0].state, 'cancelled')
    assert.equal((await db.query(`select count(*)::int as n from public.admin_history where entity_id=$1 and details->'status'->>'after'='cancelled'`, [first])).rows[0].n, 1)
  } finally { await db.close() }
})

test('cancellation boundary is Brussels arrival day; admin needs a reason', async () => {
  const db = await database()
  try {
    await asUser(db, member)
    const id = await submit(db, { start: '2026-10-21', end: '2026-10-23' })
    await assert.rejects(db.query('select public.cancel_family_booking($1)', [id]), /cancellation_requires_admin/)
    await asUser(db, admin)
    await assert.rejects(db.query('select public.cancel_family_booking($1)', [id]), /action_reason_required/)
    await db.query('select public.cancel_family_booking($1,$2)', [id, 'Intervention demandee par le membre'])
    assert.equal((await booking(db, id)).status, 'cancelled')
    const own = await submit(db)
    await db.query('select public.cancel_family_booking($1)', [own])
    assert.equal((await booking(db, own)).status, 'cancelled')
  } finally { await db.close() }
})

test('own stays never include other members even for admins; bank settings remain private', async () => {
  const db = await database()
  try {
    await asUser(db, other)
    const id = await submit(db)
    await approve(db, id)
    assert.equal((await db.query('select * from public.get_my_stays()')).rows.length, 0)
    await asUser(db, other)
    const row = (await db.query('select public.get_my_stays() as stay')).rows[0].stay
    assert.equal(row.id, id)
    assert.equal(row.amount_cents, 30000)
    assert.equal(row.transfer_instructions, 'Test bank instructions')
    await asUser(db, member)
    await db.exec('set role authenticated')
    assert.equal((await db.query('select * from public.get_my_stays()')).rows.length, 0)
    await assert.rejects(db.exec('select transfer_instructions from public.house_settings'), /permission denied/)
    await assert.rejects(db.query('select public.owner_set_booking_paid($1,true)', [id]), /owner_required/)
  } finally { await db.close() }
})

test('total payments and motivated corrections are audited and suppress pending reminders', async () => {
  const db = await database()
  try {
    await asUser(db, other)
    const id = await submit(db)
    await approve(db, id)
    await db.exec(`create or replace function public.family_today() returns date language sql stable as $$ select date '2026-11-24' $$`)
    await db.exec('select public.process_family_bookings()')
    await db.query('select public.owner_set_booking_paid($1,true)', [id])
    await db.exec('select public.process_family_bookings()')
    assert.ok((await booking(db, id)).paid_at)
    assert.equal((await db.query(`select state from public.email_outbox where booking_id=$1 and kind='payment'`, [id])).rows[0].state, 'cancelled')
    await assert.rejects(db.query('select public.owner_set_booking_paid($1,false)', [id]), /action_reason_required/)
    await db.query('select public.owner_set_booking_paid($1,false,$2)', [id, 'Erreur de rapprochement'])
    assert.equal((await booking(db, id)).paid_at, null)
    await db.exec('select public.process_family_bookings()')
    assert.equal((await db.query(`select state from public.email_outbox where booking_id=$1 and kind='payment'`, [id])).rows[0].state, 'pending')
    const audit = (await db.query(`select reason from public.admin_history where entity_id=$1 and details ? 'paid_at' order by id desc`, [id])).rows
    assert.equal(audit[0].reason, 'Erreur de rapprochement')
    assert.equal(audit[1].reason, 'Paiement total recu')
  } finally { await db.close() }
})

test('private guide and immutable audit require correct roles and do not log bank contents', async () => {
  const db = await database()
  try {
    await asUser(db, admin)
    await db.exec(`insert into public.practical_guides values('test','Guide','Contenu prive',now());
      select public.owner_save_family_settings(2026,'helene',1200,'Private IBAN must not enter history');`)
    const audit = JSON.stringify((await db.query('select details from public.admin_history')).rows)
    assert.equal(audit.includes('Private IBAN'), false)
    assert.equal(audit.includes('transfer_instructions_changed'), true)
    await asUser(db, member)
    await db.exec('set role authenticated')
    assert.equal((await db.query('select * from public.practical_guides')).rows.length, 1)
    assert.equal((await db.query('select * from public.admin_history')).rows.length, 0)
    await assert.rejects(db.exec(`update public.admin_history set reason='tampered'`), /permission denied/)
    await assert.rejects(db.exec(`update public.practical_guides set body='tampered'`), /permission denied/)
    await db.exec('reset role')
    await asUser(db, admin)
    await db.exec('set role authenticated')
    assert.ok((await db.query('select * from public.admin_history')).rows.length)
    await assert.rejects(db.exec('delete from public.admin_history'), /permission denied/)
    await db.exec('reset role')
    await db.exec(`update auth.users set email_confirmed_at=null where id='${member}'`)
    await asUser(db, member)
    await db.exec('set role authenticated')
    assert.equal((await db.query('select * from public.practical_guides')).rows.length, 0)
  } finally { await db.close() }
})
