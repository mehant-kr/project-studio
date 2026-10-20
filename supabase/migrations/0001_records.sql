-- Pindrop Studio cloud sync: the same one-row-per-record shape as the desktop app's
-- local SQLite database, owned by the signed-in user.
create table if not exists public.records (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  kind       text        not null,  -- 'tasks', 'projects', … or '_meta'
  id         text        not null,
  doc        jsonb,                 -- the record; null marks a delete so other devices see it
  updated_at timestamptz not null default now(),
  primary key (user_id, kind, id)
);

-- the server's clock decides which write is newest
create or replace function public.records_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

drop trigger if exists records_touch on public.records;
create trigger records_touch before insert or update on public.records
  for each row execute function public.records_touch();

create index if not exists records_user_updated on public.records (user_id, updated_at);

-- signed-in users can use the table through the API (newer projects don't grant this by default);
-- row-level security below still limits each of them to their own rows
revoke all on public.records from anon;
grant select, insert, update, delete on public.records to authenticated;

-- each user reads and writes only their own rows
alter table public.records enable row level security;
drop policy if exists "own records" on public.records;
create policy "own records" on public.records
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- live updates to other signed-in devices
alter publication supabase_realtime add table public.records;
