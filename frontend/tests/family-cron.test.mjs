import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PGlite } from '@electric-sql/pglite'

test('confirmation scheduling is repeatable, reactivates its job and needs no email services', async () => {
  const sql = await readFile(new URL('../../supabase/migrations/20261026170000_family_confirmation_cron.sql', import.meta.url), 'utf8')
  assert.match(sql, /create extension if not exists pg_cron;/)
  assert.doesNotMatch(sql, /vault|pg_net|http_post|family-email-delivery/i)
  const db = new PGlite()
  try {
    await db.exec(`
      create schema cron;
      create table cron.job (
        jobid bigint generated always as identity primary key,
        jobname text not null,
        schedule text not null,
        command text not null,
        username text not null default current_user,
        active boolean not null default true,
        unique(jobname, username)
      );
      create function cron.schedule(text,text,text) returns bigint language sql as $$
        insert into cron.job(jobname,schedule,command) values($1,$2,$3)
        on conflict(jobname,username) do update set schedule=excluded.schedule,command=excluded.command
        returning jobid;
      $$;
      create function cron.alter_job(job_id bigint, active boolean) returns void language sql as $$
        update cron.job set active=$2 where jobid=$1;
      $$;
    `)
    const scheduling = sql.replace('create extension if not exists pg_cron;', '')
    await db.exec(scheduling)
    await db.exec(`update cron.job set active=false, schedule='0 0 * * *'`)
    await db.exec(scheduling)
    const { rows } = await db.query('select jobname,schedule,command,active from cron.job')
    assert.deepEqual(rows, [{
      jobname: 'family-confirmations',
      schedule: '*/15 * * * *',
      command: 'select public.process_family_bookings();',
      active: true,
    }])
    const emailSetup = await readFile(new URL('../../supabase/setup-family-cron.sql', import.meta.url), 'utf8')
    assert.doesNotMatch(emailSetup, /'family-confirmations'/)
    assert.match(emailSetup, /'family-email-delivery'/)
  } finally {
    await db.close()
  }
})
