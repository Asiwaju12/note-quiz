-- Harden block lookup and provide a single atomic block action.
create or replace function public.is_blocked_between(user_a uuid, user_b uuid)
returns boolean language sql stable security definer set search_path = ''
as $function$
  select auth.uid() is not null and auth.uid() in (user_a, user_b)
     and exists (select 1 from public.user_blocks b
       where (b.blocker_id = user_a and b.blocked_id = user_b)
          or (b.blocker_id = user_b and b.blocked_id = user_a));
$function$;
revoke all on function public.is_blocked_between(uuid, uuid) from public, anon;
grant execute on function public.is_blocked_between(uuid, uuid) to authenticated;

create or replace function public.block_user(p_blocked_id uuid)
returns void language plpgsql security definer set search_path = ''
as $function$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'Sign in to block a user.'; end if;
  if p_blocked_id is null or p_blocked_id = v_user then raise exception 'Choose another user to block.'; end if;
  insert into public.user_blocks(blocker_id, blocked_id) values (v_user, p_blocked_id)
  on conflict (blocker_id, blocked_id) do nothing;
  delete from public.friend_requests
  where ((sender_id = v_user and receiver_id = p_blocked_id) or (sender_id = p_blocked_id and receiver_id = v_user))
    and status in ('pending','accepted');
  delete from public.study_room_members
  where user_id in (v_user, p_blocked_id)
    and room_id in (select a.room_id from public.study_room_members a
      join public.study_room_members b on b.room_id = a.room_id
      where a.user_id = v_user and b.user_id = p_blocked_id);
end;
$function$;
revoke all on function public.block_user(uuid) from public, anon;
grant execute on function public.block_user(uuid) to authenticated;

create or replace function public.join_study_room_by_code(p_room_code text, p_display_name text)
returns uuid language plpgsql security definer set search_path = 'public'
as $function$
declare v_room public.study_rooms%rowtype;
begin
  if auth.uid() is null then raise exception 'Sign in to join a study room.'; end if;
  select * into v_room from public.study_rooms where room_code=upper(trim(p_room_code)) and status in ('lobby','playing');
  if not found then raise exception 'Room not found or the match has finished.'; end if;
  if exists (select 1 from public.study_room_members m where m.room_id = v_room.id and m.user_id <> auth.uid()
    and public.is_blocked_between(auth.uid(), m.user_id)) then
    raise exception 'You cannot join a study room with someone you have blocked or who has blocked you.';
  end if;
  insert into public.study_room_members(room_id,user_id,display_name)
  values(v_room.id,auth.uid(),left(coalesce(nullif(trim(p_display_name),''),'Student'),24))
  on conflict(room_id,user_id) do update set last_seen_at=now();
  return v_room.id;
end;
$function$;
revoke all on function public.join_study_room_by_code(text, text) from public, anon;
grant execute on function public.join_study_room_by_code(text, text) to authenticated;

create or replace function public.get_study_room_state(p_room_id uuid)
returns jsonb language plpgsql stable security definer set search_path = 'public'
as $function$
declare v_room public.study_rooms%rowtype; v_question jsonb; v_count integer; v_standings jsonb;
begin
  if not public.is_study_room_member(p_room_id) then raise exception 'Join this room to view its game.'; end if;
  if exists (select 1 from public.study_room_members m where m.room_id = p_room_id and m.user_id <> auth.uid()
    and public.is_blocked_between(auth.uid(), m.user_id)) then
    raise exception 'This study room is unavailable because a block exists between participants.';
  end if;
  select * into v_room from public.study_rooms where id=p_room_id;
  select count(*) into v_count from public.study_room_questions where room_id=p_room_id;
  select jsonb_build_object('id',q.question_payload->>'id','prompt',q.question_payload->>'prompt','options',q.question_payload->'options','explanation',q.question_payload->>'explanation','category',q.question_payload->>'category','type',q.question_payload->>'type','index',q.question_index)
  into v_question from public.study_room_questions q where q.room_id=p_room_id and q.question_index=v_room.question_index;
  select coalesce(jsonb_agg(jsonb_build_object('user_id',m.user_id,'display_name',m.display_name,'score',m.score) order by m.score desc,m.joined_at asc),'[]'::jsonb)
  into v_standings from public.study_room_members m where m.room_id=p_room_id;
  return jsonb_build_object('id',v_room.id,'room_code',v_room.room_code,'host_id',v_room.host_id,'status',v_room.status,'question_index',v_room.question_index,'question_started_at',v_room.question_started_at,'question_duration_seconds',v_room.question_duration_seconds,'question_count',v_count,'question',v_question,'standings',v_standings);
end;
$function$;
revoke all on function public.get_study_room_state(uuid) from public, anon;
grant execute on function public.get_study_room_state(uuid) to authenticated;