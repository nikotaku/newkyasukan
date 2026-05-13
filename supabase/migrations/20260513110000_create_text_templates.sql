create table if not exists public.text_templates (
  id           uuid primary key default gen_random_uuid(),
  label        text not null,
  content      text,
  color        text not null default '#3b82f6',
  is_folder    boolean not null default false,
  parent_id    uuid references public.text_templates(id) on delete cascade,
  display_order integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.text_templates enable row level security;

create policy "text_templates select" on public.text_templates for select to authenticated using (true);
create policy "text_templates insert" on public.text_templates for insert to authenticated with check (true);
create policy "text_templates update" on public.text_templates for update to authenticated using (true);
create policy "text_templates delete" on public.text_templates for delete to authenticated using (true);

notify pgrst, 'reload schema';
