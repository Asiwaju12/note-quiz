-- Recall Quiz: one automatic reminder 24 hours after signup when email is still unverified.
-- Supabase Auth remains responsible for generating and sending the confirmation email.
-- It uses the existing Auth SMTP configuration (Gmail SMTP); no separate email provider is introduced.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create table if not exists public.verification_email_reminders (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  attempts integer not null default 0,
  last_attempt_at timestamptz,
  request_id bigint,
  sent_at timestamptz,
  last_status_code integer,
  last_error text,
  created_at timestamptz not null default now()
);

alter table public.verification_email_reminders enable row level security;
revoke all on public.verification_email_reminders from anon, authenticated;
grant all on public.verification_email_reminders to service_role;

create index if not exists verification_email_reminders_pending_idx
  on public.verification_email_reminders (last_attempt_at)
  where sent_at is null;

-- Store public project routing data in Vault rather than embedding credentials in SQL.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'recall_quiz_project_url') then
    perform vault.create_secret(
      'https://genyzkzukvtdcpvkfuxh.supabase.co',
      'recall_quiz_project_url',
      'Recall Quiz Supabase project URL'
    );
  end if;
  if not exists (select 1 from vault.secrets where name = 'recall_quiz_publishable_key') then
    perform vault.create_secret(
      'sb_publishable_ft6gm9MtXZp0cPa6qyHBcA_Nxl6wvhT',
      'recall_quiz_publishable_key',
      'Recall Quiz publishable API key for Auth resend scheduler'
    );
  end if;
end;
$$;

create or replace function public.process_verification_email_reminders()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth, net
as $function$
declare
  candidate record;
  queued_request_id bigint;
  project_url text;
  publishable_key text;
begin
  select decrypted_secret into project_url
  from vault.decrypted_secrets
  where name = 'recall_quiz_project_url';

  select decrypted_secret into publishable_key
  from vault.decrypted_secrets
  where name = 'recall_quiz_publishable_key';

  if project_url is null or publishable_key is null then
    raise exception 'Verification reminder scheduler secrets are not configured.';
  end if;

  perform pg_advisory_xact_lock(hashtext('recall-quiz-verification-email-reminders'));

  -- Resolve completed HTTP requests before queuing more reminders.
  update public.verification_email_reminders as reminder
  set sent_at = now(), last_status_code = response.status_code,
      request_id = null, last_error = null
  from net._http_response as response
  where reminder.request_id = response.id
    and reminder.sent_at is null
    and response.status_code between 200 and 299;

  update public.verification_email_reminders as reminder
  set last_status_code = response.status_code, request_id = null,
      last_error = left(coalesce(response.error_msg, response.content, 'Auth resend request failed.'), 500)
  from net._http_response as response
  where reminder.request_id = response.id
    and reminder.sent_at is null
    and (response.status_code is null or response.status_code < 200 or response.status_code >= 300);

  -- Allow retry if pg_net did not return a response.
  update public.verification_email_reminders as reminder
  set request_id = null,
      last_error = 'The Auth resend request did not return a response in time.'
  where reminder.request_id is not null
    and reminder.sent_at is null
    and reminder.last_attempt_at < now() - interval '10 minutes'
    and not exists (
      select 1 from net._http_response response
      where response.id = reminder.request_id
    );

  for candidate in
    select u.id, u.email, coalesce(reminder.attempts, 0) as attempts
    from auth.users u
    left join public.verification_email_reminders reminder on reminder.user_id = u.id
    where u.email is not null
      and u.email_confirmed_at is null
      and u.created_at <= now() - interval '24 hours'
      and (reminder.user_id is null or reminder.sent_at is null)
      and coalesce(reminder.attempts, 0) < 3
      and reminder.request_id is null
      and (reminder.last_attempt_at is null or reminder.last_attempt_at <= now() - interval '1 hour')
    order by u.created_at asc
    limit 100
  loop
    queued_request_id := net.http_post(
      url := project_url || '/auth/v1/resend?redirect_to=https%3A%2F%2Frecall-quiz-study.vercel.app%2F',
      body := jsonb_build_object('type', 'signup', 'email', candidate.email),
      params := '{}'::jsonb,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', publishable_key,
        'Authorization', 'Bearer ' || publishable_key
      ),
      timeout_milliseconds := 10000
    );

    insert into public.verification_email_reminders(user_id, email, attempts, last_attempt_at, request_id)
    values(candidate.id, candidate.email, candidate.attempts + 1, now(), queued_request_id)
    on conflict(user_id) do update set
      email = excluded.email,
      attempts = excluded.attempts,
      last_attempt_at = excluded.last_attempt_at,
      request_id = excluded.request_id,
      last_status_code = null,
      last_error = null;
  end loop;
end;
$function$;

revoke all on function public.process_verification_email_reminders() from public, anon, authenticated;

select cron.unschedule(jobid)
from cron.job
where jobname = 'recall-quiz-verification-email-reminders';

select cron.schedule(
  'recall-quiz-verification-email-reminders',
  '*/15 * * * *',
  'select public.process_verification_email_reminders();'
);
