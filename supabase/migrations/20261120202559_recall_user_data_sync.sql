-- Recall Quiz cloud snapshot storage.
-- Additive only: this does not alter or delete any existing app tables, rows,
-- policies, auth triggers, or Storage bucket configuration.

create table if not exists public.recall_user_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{"version":1,"collections":{},"settings":{},"resume":{}}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.recall_user_data enable row level security;

-- Re-runnable policy creation without touching existing policies on other tables.
drop policy if exists "Users can read their own Recall Quiz snapshot" on public.recall_user_data;
drop policy if exists "Users can insert their own Recall Quiz snapshot" on public.recall_user_data;
drop policy if exists "Users can update their own Recall Quiz snapshot" on public.recall_user_data;

create policy "Users can read their own Recall Quiz snapshot"
  on public.recall_user_data for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can insert their own Recall Quiz snapshot"
  on public.recall_user_data for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their own Recall Quiz snapshot"
  on public.recall_user_data for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update on public.recall_user_data to authenticated;

create index if not exists recall_user_data_updated_at_idx
  on public.recall_user_data (updated_at desc);


-- Extracted PDF text is stored separately so large textbooks do not inflate the
-- single per-user metadata snapshot. Local document IDs remain text IDs.
create table if not exists public.recall_document_texts (
  user_id uuid not null references auth.users(id) on delete cascade,
  document_id text not null,
  pages jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, document_id)
);

alter table public.recall_document_texts enable row level security;
drop policy if exists "Users can read their own Recall Quiz document text" on public.recall_document_texts;
drop policy if exists "Users can insert their own Recall Quiz document text" on public.recall_document_texts;
drop policy if exists "Users can update their own Recall Quiz document text" on public.recall_document_texts;

create policy "Users can read their own Recall Quiz document text"
  on public.recall_document_texts for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users can insert their own Recall Quiz document text"
  on public.recall_document_texts for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Users can update their own Recall Quiz document text"
  on public.recall_document_texts for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update on public.recall_document_texts to authenticated;
create index if not exists recall_document_texts_user_idx
  on public.recall_document_texts (user_id, updated_at desc);
