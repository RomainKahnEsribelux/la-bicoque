-- Run only after migrations and Edge Function deployment.
-- Add Vault secrets family_jobs_url and family_jobs_secret through the dashboard.
-- family_jobs_url: https://PROJECT.supabase.co/functions/v1/family-jobs
-- family_jobs_secret: same strong random value as the Edge Function secret.
create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  if (select count(distinct name) from vault.decrypted_secrets
      where name in ('family_jobs_url','family_jobs_secret')) <> 2 then
    raise exception 'Configure both family job Vault secrets before scheduling';
  end if;
end $$;

select cron.schedule(
  'family-confirmations',
  '*/15 * * * *',
  $$select public.process_family_bookings();$$
)
where not exists (select 1 from cron.job where jobname='family-confirmations');

select cron.schedule(
  'family-email-delivery',
  '*/15 * * * *',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name='family_jobs_url'),
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='family_jobs_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $job$
)
where not exists (select 1 from cron.job where jobname='family-email-delivery');
