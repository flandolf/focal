-- Server-issued revisions make incremental pulls independent of device clocks.
create sequence if not exists public.focal_sync_revision_seq;

create or replace function public.set_sync_metadata()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  new.sync_revision = nextval('public.focal_sync_revision_seq');
  return new;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'projects',
    'events',
    'study_sessions',
    'custom_subjects',
    'hidden_subjects',
    'timetable_config',
    'user_settings'
  ]
  loop
    execute format(
      'alter table public.%I add column if not exists sync_revision bigint',
      table_name
    );
    execute format(
      'update public.%I set sync_revision = nextval(''public.focal_sync_revision_seq'') where sync_revision is null',
      table_name
    );
    execute format(
      'alter table public.%I alter column sync_revision set default nextval(''public.focal_sync_revision_seq'')',
      table_name
    );
    execute format(
      'alter table public.%I alter column sync_revision set not null',
      table_name
    );
    execute format(
      'create index if not exists %I on public.%I (user_id, sync_revision)',
      table_name || '_user_sync_revision_idx',
      table_name
    );
    execute format('drop trigger if exists %I on public.%I', 'set_' || table_name || '_updated_at', table_name);
    execute format('drop trigger if exists %I on public.%I', 'set_' || table_name || '_sync_metadata', table_name);
    execute format(
      'create trigger %I before insert or update on public.%I for each row execute function public.set_sync_metadata()',
      'set_' || table_name || '_sync_metadata',
      table_name
    );
  end loop;
end;
$$;

grant usage on sequence public.focal_sync_revision_seq to authenticated;
