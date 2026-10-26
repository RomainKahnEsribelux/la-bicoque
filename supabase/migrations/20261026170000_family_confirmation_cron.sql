begin;

create extension if not exists pg_cron;

select cron.schedule(
  'family-confirmations',
  '*/15 * * * *',
  $$select public.process_family_bookings();$$
);

select cron.alter_job(
  jobid,
  active := true
)
from cron.job
where jobname = 'family-confirmations' and username = current_user;

commit;
