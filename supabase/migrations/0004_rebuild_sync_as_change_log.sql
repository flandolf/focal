-- Focal sync v2: immutable operations replace mutable per-entity rows.
-- This intentionally removes the legacy tables; they contain polluted duplicate
-- state and cannot represent hard deletion safely across offline devices.
drop table if exists public.sync_state cascade;
drop table if exists public.user_settings cascade;
drop table if exists public.timetable_config cascade;
drop table if exists public.hidden_subjects cascade;
drop table if exists public.custom_subjects cascade;
drop table if exists public.study_sessions cascade;
drop table if exists public.events cascade;
drop table if exists public.projects cascade;
drop sequence if exists public.focal_sync_revision_seq cascade;

create sequence public.focal_change_revision_seq;

create table public.sync_changes (
  user_id uuid not null references auth.users(id) on delete cascade,
  change_id uuid not null,
  device_id text not null,
  entity text not null check (entity in (
    'projects',
    'events',
    'study_sessions',
    'custom_subjects',
    'hidden_subjects',
    'timetable_config',
    'user_settings'
  )),
  row_id text not null,
  operation text not null check (operation in ('put', 'delete')),
  payload jsonb,
  revision bigint not null default nextval('public.focal_change_revision_seq'),
  created_at timestamptz not null default now(),
  primary key (user_id, change_id),
  constraint sync_changes_payload_check check (
    (operation = 'put' and payload is not null)
    or (operation = 'delete' and payload is null)
  )
);

create table public.sync_change_receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  change_id uuid not null,
  accepted_at timestamptz not null default now(),
  primary key (user_id, change_id)
);

create unique index sync_changes_revision_idx on public.sync_changes (revision);
create index sync_changes_user_revision_idx on public.sync_changes (user_id, revision);
create index sync_changes_user_entity_row_idx on public.sync_changes (user_id, entity, row_id, revision desc);

create or replace function public.reject_replayed_focal_sync_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.sync_change_receipts
     where user_id = new.user_id and change_id = new.change_id
  ) then
    return null;
  end if;

  insert into public.sync_change_receipts (user_id, change_id)
  values (new.user_id, new.change_id);
  return new;
end;
$$;

create trigger reject_replayed_focal_sync_change_before_insert
before insert on public.sync_changes
for each row execute function public.reject_replayed_focal_sync_change();

create or replace function public.compact_focal_sync_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.sync_changes
   where user_id = new.user_id
     and entity = new.entity
     and row_id = new.row_id
     and revision < new.revision;
  return new;
end;
$$;

create trigger compact_focal_sync_changes_after_insert
after insert on public.sync_changes
for each row execute function public.compact_focal_sync_changes();

alter table public.sync_changes enable row level security;
alter table public.sync_change_receipts enable row level security;

create policy "sync changes select own rows"
on public.sync_changes for select to authenticated
using ((select auth.uid()) = user_id);

create policy "sync changes insert own rows"
on public.sync_changes for insert to authenticated
with check ((select auth.uid()) = user_id);

grant select, insert on public.sync_changes to authenticated;
grant usage on sequence public.focal_change_revision_seq to authenticated;

alter publication supabase_realtime add table public.sync_changes;
