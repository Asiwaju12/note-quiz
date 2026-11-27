alter table public.moderation_admins
  add column if not exists role text not null default 'moderator',
  add column if not exists permissions text[] not null default array['reports.manage','safety.review'];

alter table public.moderation_admins
  drop constraint if exists moderation_admins_role_check;
alter table public.moderation_admins
  add constraint moderation_admins_role_check
  check (role in ('super_admin','admin','moderator','ai_reviewer','support'));

create table if not exists public.moderation_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references auth.users(id) on delete restrict,
  action text not null,
  target_type text,
  target_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists moderation_audit_created_idx on public.moderation_audit_log(created_at desc);
create index if not exists moderation_audit_actor_idx on public.moderation_audit_log(actor_id,created_at desc);
alter table public.moderation_audit_log enable row level security;
grant select,insert on public.moderation_audit_log to authenticated;

create table if not exists public.platform_announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 120),
  body text not null check (char_length(body) between 1 and 2000),
  severity text not null default 'info' check (severity in ('info','success','warning','critical')),
  published boolean not null default false,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists platform_announcements_active_idx on public.platform_announcements(published,starts_at desc);
alter table public.platform_announcements enable row level security;
grant select,insert,update,delete on public.platform_announcements to authenticated;

create table if not exists public.moderation_ai_reviews (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.ai_activity_events(id) on delete cascade,
  reviewer_id uuid not null references auth.users(id) on delete restrict,
  status text not null default 'flagged' check (status in ('flagged','investigating','resolved','dismissed')),
  reason text not null check (char_length(reason) between 1 and 1000),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(activity_id)
);
alter table public.moderation_ai_reviews enable row level security;
grant select,insert,update on public.moderation_ai_reviews to authenticated;

create or replace function public.has_moderation_permission(requested_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.moderation_admins m
    where m.user_id = (select auth.uid())
      and (
        m.role = 'super_admin'
        or requested_permission = any(m.permissions)
      )
  );
$$;
revoke all on function public.has_moderation_permission(text) from public, anon;
grant execute on function public.has_moderation_permission(text) to authenticated;

create or replace function public.manage_moderator(target_user_id uuid, new_role text, new_permissions text[] default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  chosen_permissions text[];
begin
  if actor is null or not public.has_moderation_permission('moderators.manage') then
    raise exception 'Super Admin permission required' using errcode = '42501';
  end if;
  if new_role not in ('admin','moderator','ai_reviewer','support') then
    raise exception 'Invalid moderator role';
  end if;
  if not exists (select 1 from auth.users u where u.id = target_user_id) then
    raise exception 'User does not exist';
  end if;
  chosen_permissions := coalesce(new_permissions,
    case new_role
      when 'admin' then array['users.view','reports.manage','ai.review','announcements.manage','study.review','audit.view','safety.review']
      when 'moderator' then array['reports.manage','safety.review']
      when 'ai_reviewer' then array['ai.review']
      when 'support' then array['users.view','support.manage']
      else array[]::text[]
    end
  );
  if exists (
    select 1 from unnest(chosen_permissions) p
    where p not in ('users.view','reports.manage','ai.review','announcements.manage','study.review','audit.view','safety.review','support.manage')
  ) then raise exception 'Unknown permission'; end if;

  if new_role = 'admin' and 'moderators.manage' = any(chosen_permissions) then
    raise exception 'Only the Super Admin can appoint moderators';
  end if;

  insert into public.moderation_admins(user_id,role,permissions)
  values(target_user_id,new_role,chosen_permissions)
  on conflict(user_id) do update set role=excluded.role, permissions=excluded.permissions;

  insert into public.moderation_audit_log(actor_id,action,target_type,target_id,details)
  values(actor,'moderator.role_changed','user',target_user_id::text,jsonb_build_object('role',new_role,'permissions',chosen_permissions));
end;
$$;
revoke all on function public.manage_moderator(uuid,text,text[]) from public, anon;
grant execute on function public.manage_moderator(uuid,text,text[]) to authenticated;

drop policy if exists "moderators read audit log" on public.moderation_audit_log;
create policy "moderators read audit log" on public.moderation_audit_log
for select to authenticated using (public.has_moderation_permission('audit.view'));
drop policy if exists "moderators write audit log" on public.moderation_audit_log;
create policy "moderators write audit log" on public.moderation_audit_log
for insert to authenticated with check (
  actor_id = (select auth.uid())
  and public.has_moderation_permission('audit.view')
);

drop policy if exists "everyone reads active announcements" on public.platform_announcements;
create policy "everyone reads active announcements" on public.platform_announcements
for select to authenticated using (published = true and starts_at <= now() and (ends_at is null or ends_at > now()));
drop policy if exists "moderators manage announcements" on public.platform_announcements;
create policy "moderators manage announcements" on public.platform_announcements
for all to authenticated
using (public.has_moderation_permission('announcements.manage'))
with check (public.has_moderation_permission('announcements.manage') and created_by = (select auth.uid()));

drop policy if exists "AI reviewers read AI review flags" on public.moderation_ai_reviews;
create policy "AI reviewers read AI review flags" on public.moderation_ai_reviews
for select to authenticated using (public.has_moderation_permission('ai.review'));
drop policy if exists "AI reviewers create AI review flags" on public.moderation_ai_reviews;
create policy "AI reviewers create AI review flags" on public.moderation_ai_reviews
for insert to authenticated with check (reviewer_id = (select auth.uid()) and public.has_moderation_permission('ai.review'));
drop policy if exists "AI reviewers update AI review flags" on public.moderation_ai_reviews;
create policy "AI reviewers update AI review flags" on public.moderation_ai_reviews
for update to authenticated using (public.has_moderation_permission('ai.review'))
with check (public.has_moderation_permission('ai.review'));

drop policy if exists "moderators manage report review" on public.message_reports;
create policy "moderators manage report review" on public.message_reports
for update to authenticated using (public.has_moderation_permission('reports.manage'))
with check (public.has_moderation_permission('reports.manage'));
drop policy if exists "reporters and moderators read reports" on public.message_reports;
create policy "reporters and moderators read reports" on public.message_reports
for select to authenticated using (
  reporter_id = (select auth.uid())
  or public.has_moderation_permission('reports.manage')
);
drop policy if exists "moderators can review platform blocks" on public.user_blocks;
create policy "moderators can review platform blocks" on public.user_blocks
for select to authenticated using (public.has_moderation_permission('safety.review'));

drop policy if exists "students and moderators read AI activity" on public.ai_activity_events;
create policy "students and authorized AI reviewers read AI activity" on public.ai_activity_events
for select to authenticated using (
  user_id = (select auth.uid())
  or public.has_moderation_permission('ai.review')
);

drop policy if exists "moderators can read moderator directory" on public.moderation_admins;
create policy "moderators can read moderator directory" on public.moderation_admins
for select to authenticated using (
  user_id = (select auth.uid())
  or public.has_moderation_permission('moderators.manage')
);

update public.moderation_admins
set role='super_admin',
    permissions=array['users.view','reports.manage','ai.review','announcements.manage','study.review','audit.view','safety.review','support.manage','moderators.manage']
where user_id='3f017dac-cadd-46ec-8ee8-cc3775302252';

insert into public.moderation_audit_log(actor_id,action,target_type,target_id,details)
values('3f017dac-cadd-46ec-8ee8-cc3775302252','moderator.control_centre_initialized','platform',null,jsonb_build_object('owner_role','super_admin'))
on conflict do nothing;
