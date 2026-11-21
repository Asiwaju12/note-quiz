-- ════════════════════════════════════════════════════════════════════════════
-- Recall Quiz — PROPOSED Supabase schema
--
-- STATUS: proposal only. None of these tables are known to exist in a live
-- project. Review, then run in the Supabase SQL editor (or as a migration).
--
-- Tables marked [ORIGINAL] are already used by the original app code
-- (src/services/*.ts, src/lib/game/daily.ts). Their definitions here match what
-- that code reads and writes; if they already exist in your project, skip them.
--
-- Every user-owned table has row-level security: a user can only see and
-- change their own rows. daily_scores additionally allows public reads for the
-- shared leaderboard.
-- ════════════════════════════════════════════════════════════════════════════

create extension if not exists "pgcrypto";
create extension if not exists "vector";   -- pgvector, for document embeddings (RAG)

-- Helper: updated_at maintenance
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

-- ───────────────────────── Users & profiles ─────────────────────────

-- [ORIGINAL] One row per auth user. Created by the trigger below on sign-up.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'New player' check (char_length(display_name) between 1 and 40),
  handle text not null check (handle ~ '^[A-Z0-9]{2,4}$'),
  avatar_color text not null default '#8B71EE',
  created_at timestamptz not null default now()
);

-- New: preferences that are local-only today (src/data/settings.ts).
create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  theme text not null default 'system' check (theme in ('system','light','dark')),
  daily_goal_minutes int not null default 30 check (daily_goal_minutes between 5 and 600),
  daily_goal_cards int not null default 20 check (daily_goal_cards between 1 and 500),
  pace text not null default 'standard' check (pace in ('relaxed','standard','rush')),
  muted boolean not null default false,
  reduce_motion boolean not null default false,
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, handle)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'display_name', ''), 'New player'),
    coalesce(nullif(upper(new.raw_user_meta_data->>'handle'), ''), 'YOU')
  );
  insert into public.user_settings (user_id) values (new.id);
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ───────────────────────── Subjects (folders) ─────────────────────────

create table if not exists public.folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  color text not null default '#8B71EE',
  created_at timestamptz not null default now()
);
create index if not exists folders_user_idx on public.folders(user_id);

-- ───────────────────────── Documents & processing ─────────────────────────

-- [ORIGINAL] study_documents is written by uploadStudyFiles() in services/cloud.ts.
-- Extended with the Study Centre fields (all new columns are nullable/defaulted).
create table if not exists public.study_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  bucket_id text not null default 'study-documents',
  object_path text not null,            -- '<user_id>/<document_id>.pdf'
  original_name text not null,
  mime_type text,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 52428800),
  created_at timestamptz not null default now()
);
alter table public.study_documents
  add column if not exists title text,
  add column if not exists folder_id uuid references public.folders(id) on delete set null,
  add column if not exists page_count int not null default 0,
  add column if not exists char_count int not null default 0,
  add column if not exists status text not null default 'processing' check (status in ('uploading','processing','ready','error')),
  add column if not exists progress int not null default 0 check (progress between 0 and 100),
  add column if not exists error text,
  add column if not exists last_page int not null default 1,
  add column if not exists last_opened_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();
create index if not exists study_documents_user_idx on public.study_documents(user_id, updated_at desc);
drop trigger if exists study_documents_touch on public.study_documents;
create trigger study_documents_touch before update on public.study_documents for each row execute function public.touch_updated_at();

-- Extracted text, one row per page (keeps page references reliable).
create table if not exists public.document_pages (
  document_id uuid not null references public.study_documents(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  page_number int not null check (page_number >= 1),
  content text not null,
  primary key (document_id, page_number)
);

-- RAG: chunks + embeddings. Dimension 1024 matches Voyage AI voyage-3 family;
-- change it to match the embedding model you choose.
create table if not exists public.document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.study_documents(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  page_number int not null,
  chunk_index int not null,
  content text not null,
  embedding vector(1024),
  created_at timestamptz not null default now()
);
create index if not exists document_chunks_doc_idx on public.document_chunks(document_id);
create index if not exists document_chunks_embedding_idx on public.document_chunks using hnsw (embedding vector_cosine_ops);

-- Vector search, scoped to the caller and one document. Mirrors retrieve() in src/lib/study/retrieval.ts.
create or replace function public.match_document_chunks(p_document_id uuid, p_query_embedding vector(1024), p_match_count int default 6)
returns table (id uuid, page_number int, content text, similarity float)
language sql stable security invoker as $$
  select c.id, c.page_number, c.content, 1 - (c.embedding <=> p_query_embedding) as similarity
  from public.document_chunks c
  where c.document_id = p_document_id and c.user_id = auth.uid() and c.embedding is not null
  order by c.embedding <=> p_query_embedding
  limit least(p_match_count, 20);
$$;

-- Generated study material: summary | notes | keyTerms | guide (JSON shapes in src/data/models.ts).
create table if not exists public.document_artifacts (
  document_id uuid not null references public.study_documents(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('summary','notes','keyTerms','guide')),
  source text not null check (source in ('ai','local')),
  data jsonb not null,
  truncated boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (document_id, kind)
);

-- ───────────────────────── Personal notes, highlights, bookmarks ─────────────────────────

create table if not exists public.highlights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid not null references public.study_documents(id) on delete cascade,
  page_number int not null,
  text text not null check (char_length(text) <= 2000),
  color text not null default 'yellow',
  note text,
  created_at timestamptz not null default now()
);
create table if not exists public.bookmarks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid not null references public.study_documents(id) on delete cascade,
  page_number int not null,
  label text not null,
  created_at timestamptz not null default now(),
  unique (document_id, page_number)
);
create table if not exists public.document_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid not null references public.study_documents(id) on delete cascade,
  page_number int,
  text text not null check (char_length(text) <= 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- [ORIGINAL] Free-text notes draft used by Create Quiz → From notes.
create table if not exists public.study_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Untitled notes',
  content text not null default '',
  source_files jsonb not null default '[]',
  updated_at timestamptz not null default now()
);

-- ───────────────────────── Decks, questions, flashcards ─────────────────────────

-- [ORIGINAL] study_decks stores questions as JSON (Question type in src/lib/game/types.ts).
create table if not exists public.study_decks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  kind text not null default 'notes',
  questions jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.study_decks drop constraint if exists study_decks_kind_check;
alter table public.study_decks add constraint study_decks_kind_check check (kind in ('sample','notes','manual','document'));
alter table public.study_decks
  add column if not exists folder_id uuid references public.folders(id) on delete set null,
  add column if not exists document_id uuid references public.study_documents(id) on delete cascade,
  add column if not exists source text check (source in ('ai','local')),
  add column if not exists last_played_at timestamptz;

create table if not exists public.flashcards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  deck_id uuid not null references public.study_decks(id) on delete cascade,
  document_id uuid references public.study_documents(id) on delete cascade,
  front text not null,
  back text not null,
  topic text,
  source_page int,
  flag text check (flag in ('understood','revise')),
  -- FSRS scheduling state (src/lib/srs/fsrs.ts)
  due timestamptz not null default now(),
  stability double precision not null default 0,
  difficulty double precision not null default 0,
  elapsed_days int not null default 0,
  scheduled_days int not null default 0,
  learning_steps int not null default 0,
  reps int not null default 0,
  lapses int not null default 0,
  state text not null default 'new' check (state in ('new','learning','review','relearning')),
  last_review timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists flashcards_due_idx on public.flashcards(user_id, due);

-- Revision schedule history (one row per review).
create table if not exists public.review_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  card_id uuid not null references public.flashcards(id) on delete cascade,
  rating smallint not null check (rating between 1 and 4),
  state_before text not null,
  reviewed_at timestamptz not null default now()
);

-- ───────────────────────── Attempts, exams, progress ─────────────────────────

-- Practice quizzes, exam attempts and arcade runs. `answers` holds AnswerRecord[].
create table if not exists public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null check (mode in ('practice','exam','arcade','daily')),
  title text not null,
  deck_id uuid references public.study_decks(id) on delete set null,
  document_id uuid references public.study_documents(id) on delete set null,
  started_at timestamptz not null,
  finished_at timestamptz not null,
  duration_sec int not null default 0,
  total int not null,
  correct int not null,
  score_pct int not null check (score_pct between 0 and 100),
  points int,
  answers jsonb not null default '[]'
);
create index if not exists quiz_attempts_user_idx on public.quiz_attempts(user_id, finished_at desc);

-- [ORIGINAL] arcade high scores.
create table if not exists public.quiz_scores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  handle text not null,
  score int not null check (score between 0 and 99999),
  level int not null,
  streak int not null,
  accuracy int not null,
  mode text not null default 'classic',
  created_at timestamptz not null default now()
);

-- [ORIGINAL] shared Daily Drop board (one best row per user per day).
create table if not exists public.daily_scores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  score_date date not null,
  handle text not null,
  score int not null check (score between 0 and 99999),
  correct int not null,
  total int not null,
  streak int not null,
  created_at timestamptz not null default now(),
  unique (user_id, score_date)
);

-- Per-day counters (study minutes, questions, cards…) — drives streaks, goals, challenges, analytics.
create table if not exists public.daily_stats (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  minutes numeric(7,2) not null default 0,
  questions int not null default 0,
  correct int not null default 0,
  cards int not null default 0,
  sessions int not null default 0,
  topics int not null default 0,
  docs_opened int not null default 0,
  ai_messages int not null default 0,
  points int not null default 0,
  primary key (user_id, day)
);

create table if not exists public.topic_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid not null references public.study_documents(id) on delete cascade,
  topic_id text not null,
  completed_at timestamptz not null default now(),
  primary key (user_id, document_id, topic_id)
);

create table if not exists public.activity_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  title text not null,
  detail text,
  link text,
  at timestamptz not null default now()
);
create index if not exists activity_user_idx on public.activity_events(user_id, at desc);

-- ───────────────────────── Recall AI conversations ─────────────────────────

create table if not exists public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid references public.study_documents(id) on delete cascade,
  title text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  mode text,
  sources jsonb,                -- [{ page, excerpt }]
  grounded boolean,
  error text,
  created_at timestamptz not null default now()
);
create index if not exists ai_messages_conv_idx on public.ai_messages(conversation_id, created_at);

-- ───────────────────────── Planner, goals, achievements ─────────────────────────

create table if not exists public.study_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  subject text not null default '',
  target_date date not null,
  daily_minutes int not null check (daily_minutes between 5 and 600),
  document_ids uuid[] not null default '{}',
  deck_ids uuid[] not null default '{}',
  archived boolean not null default false,
  created_at timestamptz not null default now()
);
-- Revision schedule tasks
create table if not exists public.plan_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  goal_id uuid references public.study_goals(id) on delete cascade,
  title text not null,
  due_date date not null,
  minutes int,
  link text,
  done boolean not null default false,
  done_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists public.user_achievements (
  user_id uuid not null references auth.users(id) on delete cascade,
  achievement_id text not null,
  unlocked_at timestamptz not null default now(),
  primary key (user_id, achievement_id)
);
create table if not exists public.challenge_claims (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  challenge_id text not null,
  points int not null,
  claimed_at timestamptz not null default now(),
  primary key (user_id, day, challenge_id)
);

-- ───────────────────────── Row-level security ─────────────────────────

do $$
declare t text;
begin
  foreach t in array array[
    'user_settings','folders','study_documents','document_pages','document_chunks','document_artifacts',
    'highlights','bookmarks','document_notes','study_notes','study_decks','flashcards','review_logs',
    'quiz_attempts','quiz_scores','daily_stats','topic_progress','activity_events','ai_conversations',
    'ai_messages','study_goals','plan_tasks','user_achievements','challenge_claims'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format('create policy "own rows" on public.%I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;

alter table public.profiles enable row level security;
drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles for all to authenticated using (id = auth.uid()) with check (id = auth.uid());

alter table public.daily_scores enable row level security;
drop policy if exists "public read daily" on public.daily_scores;
create policy "public read daily" on public.daily_scores for select to anon, authenticated using (true);
drop policy if exists "own daily writes" on public.daily_scores;
create policy "own daily writes" on public.daily_scores for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "own daily updates" on public.daily_scores;
create policy "own daily updates" on public.daily_scores for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ───────────────────────── Storage ─────────────────────────
-- Private bucket for uploaded PDFs. Objects live at '<user_id>/<file>'.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('study-documents', 'study-documents', false, 52428800, array['application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
-- NOTE: the original FileImporter also uploads DOCX, images and text files to this
-- bucket. If you keep that behaviour, widen allowed_mime_types accordingly.

drop policy if exists "read own documents" on storage.objects;
create policy "read own documents" on storage.objects for select to authenticated
  using (bucket_id = 'study-documents' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "upload own documents" on storage.objects;
create policy "upload own documents" on storage.objects for insert to authenticated
  with check (bucket_id = 'study-documents' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "delete own documents" on storage.objects;
create policy "delete own documents" on storage.objects for delete to authenticated
  using (bucket_id = 'study-documents' and (storage.foldername(name))[1] = auth.uid()::text);
