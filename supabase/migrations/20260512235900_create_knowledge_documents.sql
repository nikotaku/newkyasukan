-- Table for free-text knowledge documents keyed by slug
create table if not exists public.knowledge_documents (
  slug text primary key,
  content text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.knowledge_documents enable row level security;

create policy "Authenticated users can read knowledge_documents"
  on public.knowledge_documents for select
  to authenticated using (true);

create policy "Authenticated users can upsert knowledge_documents"
  on public.knowledge_documents for insert
  to authenticated with check (true);

create policy "Authenticated users can update knowledge_documents"
  on public.knowledge_documents for update
  to authenticated using (true);

notify pgrst, 'reload schema';
