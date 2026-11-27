create table if not exists public.ai_activity_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id text not null,
  user_message text not null,
  assistant_message text not null,
  document_title text,
  created_at timestamptz not null default now()
);
create index if not exists ai_activity_events_user_created_idx on public.ai_activity_events (user_id, created_at desc);
create index if not exists ai_activity_events_conversation_idx on public.ai_activity_events (conversation_id, created_at asc);
alter table public.ai_activity_events enable row level security;
revoke all on public.ai_activity_events from anon;
grant select, insert on public.ai_activity_events to authenticated;
drop policy if exists "students and moderators read AI activity" on public.ai_activity_events;
create policy "students and moderators read AI activity"
on public.ai_activity_events for select to authenticated
using (
  user_id = (select auth.uid())
  or exists (select 1 from public.moderation_admins m where m.user_id = (select auth.uid()))
);
drop policy if exists "students log their own AI activity" on public.ai_activity_events;
create policy "students log their own AI activity"
on public.ai_activity_events for insert to authenticated
with check (user_id = (select auth.uid()));
