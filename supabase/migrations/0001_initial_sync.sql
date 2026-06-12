create extension if not exists "pgcrypto";

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.projects (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  icon text,
  deadline timestamptz,
  folder_path text not null,
  subject_id text,
  unit text check (unit is null or unit in ('1', '2', '3', '4')),
  deadline_type text check (deadline_type is null or deadline_type in ('sac', 'exam', 'assignment')),
  exam_date timestamptz,
  is_favorite boolean not null default false,
  is_archived boolean not null default false,
  is_finished boolean not null default false,
  custom_subfolders jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  last_modified_device_id text
);

create table if not exists public.events (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  start_time timestamptz not null,
  end_time timestamptz,
  event_type text not null check (event_type in ('sac', 'exam', 'assignment', 'event', 'homework', 'other', 'practice-sac')),
  subject_id text,
  location text,
  is_finished boolean not null default false,
  finished_at timestamptz,
  source jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  last_modified_device_id text
);

create table if not exists public.study_sessions (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid,
  subject_ids jsonb not null default '[]'::jsonb,
  title text not null,
  description text,
  start_time timestamptz not null,
  end_time timestamptz not null,
  status text not null check (status in ('planned', 'in-progress', 'completed')),
  topics jsonb,
  notes text,
  confidence integer check (confidence is null or confidence between 1 and 5),
  blockers text,
  next_action text,
  active_durations jsonb,
  completed_at timestamptz,
  source jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  last_modified_device_id text
);

create table if not exists public.custom_subjects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject_key text not null,
  name text not null,
  short_code text not null,
  color text not null,
  icon text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  last_modified_device_id text,
  unique (user_id, subject_key)
);

create table if not exists public.hidden_subjects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  last_modified_device_id text,
  unique (user_id, subject_id)
);

create table if not exists public.timetable_config (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  config jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  last_modified_device_id text,
  unique (user_id)
);

create table if not exists public.sync_state (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id text not null,
  table_name text not null,
  last_pulled_at timestamptz,
  last_successful_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  last_modified_device_id text,
  unique (user_id, device_id, table_name)
);

create index if not exists projects_user_updated_idx on public.projects (user_id, updated_at);
create index if not exists events_user_updated_idx on public.events (user_id, updated_at);
create index if not exists study_sessions_user_updated_idx on public.study_sessions (user_id, updated_at);
create index if not exists custom_subjects_user_updated_idx on public.custom_subjects (user_id, updated_at);
create index if not exists hidden_subjects_user_updated_idx on public.hidden_subjects (user_id, updated_at);
create index if not exists timetable_config_user_updated_idx on public.timetable_config (user_id, updated_at);
create index if not exists sync_state_user_updated_idx on public.sync_state (user_id, updated_at);

drop trigger if exists set_projects_updated_at on public.projects;
create trigger set_projects_updated_at before update on public.projects
for each row execute function public.set_updated_at();

drop trigger if exists set_events_updated_at on public.events;
create trigger set_events_updated_at before update on public.events
for each row execute function public.set_updated_at();

drop trigger if exists set_study_sessions_updated_at on public.study_sessions;
create trigger set_study_sessions_updated_at before update on public.study_sessions
for each row execute function public.set_updated_at();

drop trigger if exists set_custom_subjects_updated_at on public.custom_subjects;
create trigger set_custom_subjects_updated_at before update on public.custom_subjects
for each row execute function public.set_updated_at();

drop trigger if exists set_hidden_subjects_updated_at on public.hidden_subjects;
create trigger set_hidden_subjects_updated_at before update on public.hidden_subjects
for each row execute function public.set_updated_at();

drop trigger if exists set_timetable_config_updated_at on public.timetable_config;
create trigger set_timetable_config_updated_at before update on public.timetable_config
for each row execute function public.set_updated_at();

drop trigger if exists set_sync_state_updated_at on public.sync_state;
create trigger set_sync_state_updated_at before update on public.sync_state
for each row execute function public.set_updated_at();

alter table public.projects enable row level security;
alter table public.events enable row level security;
alter table public.study_sessions enable row level security;
alter table public.custom_subjects enable row level security;
alter table public.hidden_subjects enable row level security;
alter table public.timetable_config enable row level security;
alter table public.sync_state enable row level security;

create policy "projects select own rows" on public.projects for select to authenticated using ((select auth.uid()) = user_id);
create policy "projects insert own rows" on public.projects for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "projects update own rows" on public.projects for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "projects delete own rows" on public.projects for delete to authenticated using ((select auth.uid()) = user_id);

create policy "events select own rows" on public.events for select to authenticated using ((select auth.uid()) = user_id);
create policy "events insert own rows" on public.events for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "events update own rows" on public.events for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "events delete own rows" on public.events for delete to authenticated using ((select auth.uid()) = user_id);

create policy "study_sessions select own rows" on public.study_sessions for select to authenticated using ((select auth.uid()) = user_id);
create policy "study_sessions insert own rows" on public.study_sessions for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "study_sessions update own rows" on public.study_sessions for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "study_sessions delete own rows" on public.study_sessions for delete to authenticated using ((select auth.uid()) = user_id);

create policy "custom_subjects select own rows" on public.custom_subjects for select to authenticated using ((select auth.uid()) = user_id);
create policy "custom_subjects insert own rows" on public.custom_subjects for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "custom_subjects update own rows" on public.custom_subjects for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "custom_subjects delete own rows" on public.custom_subjects for delete to authenticated using ((select auth.uid()) = user_id);

create policy "hidden_subjects select own rows" on public.hidden_subjects for select to authenticated using ((select auth.uid()) = user_id);
create policy "hidden_subjects insert own rows" on public.hidden_subjects for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "hidden_subjects update own rows" on public.hidden_subjects for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "hidden_subjects delete own rows" on public.hidden_subjects for delete to authenticated using ((select auth.uid()) = user_id);

create policy "timetable_config select own rows" on public.timetable_config for select to authenticated using ((select auth.uid()) = user_id);
create policy "timetable_config insert own rows" on public.timetable_config for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "timetable_config update own rows" on public.timetable_config for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "timetable_config delete own rows" on public.timetable_config for delete to authenticated using ((select auth.uid()) = user_id);

create policy "sync_state select own rows" on public.sync_state for select to authenticated using ((select auth.uid()) = user_id);
create policy "sync_state insert own rows" on public.sync_state for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "sync_state update own rows" on public.sync_state for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "sync_state delete own rows" on public.sync_state for delete to authenticated using ((select auth.uid()) = user_id);

alter publication supabase_realtime add table public.projects;
alter publication supabase_realtime add table public.events;
alter publication supabase_realtime add table public.study_sessions;
alter publication supabase_realtime add table public.custom_subjects;
alter publication supabase_realtime add table public.hidden_subjects;
alter publication supabase_realtime add table public.timetable_config;
