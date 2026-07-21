-- Remove the last legacy sync helpers and assert the replacement is complete.
drop function if exists public.set_updated_at() cascade;
drop function if exists public.set_sync_metadata() cascade;

revoke all on public.sync_change_receipts from anon, authenticated;
revoke update, delete, truncate, references, trigger on public.sync_changes from anon, authenticated;
grant select, insert on public.sync_changes to authenticated;

do $$
declare
  policy_count integer;
begin
  if to_regclass('public.sync_changes') is null
     or to_regclass('public.sync_change_receipts') is null then
    raise exception 'Focal sync change-log tables are missing';
  end if;

  if to_regclass('public.projects') is not null
     or to_regclass('public.events') is not null
     or to_regclass('public.study_sessions') is not null
     or to_regclass('public.custom_subjects') is not null
     or to_regclass('public.hidden_subjects') is not null
     or to_regclass('public.timetable_config') is not null
     or to_regclass('public.user_settings') is not null
     or to_regclass('public.sync_state') is not null then
    raise exception 'Legacy Focal sync tables still exist';
  end if;

  if not exists (
    select 1 from pg_class
     where oid = 'public.sync_changes'::regclass and relrowsecurity
  ) or not exists (
    select 1 from pg_class
     where oid = 'public.sync_change_receipts'::regclass and relrowsecurity
  ) then
    raise exception 'RLS is not enabled on every Focal sync table';
  end if;

  select count(*) into policy_count
    from pg_policies
   where schemaname = 'public' and tablename = 'sync_changes';
  if policy_count <> 2 then
    raise exception 'Expected exactly two sync_changes RLS policies, found %', policy_count;
  end if;

  if exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'sync_change_receipts'
  ) then
    raise exception 'The private receipt ledger must not expose an RLS policy';
  end if;

  if not exists (
    select 1 from pg_trigger
     where tgrelid = 'public.sync_changes'::regclass
       and tgname = 'reject_replayed_focal_sync_change_before_insert'
       and not tgisinternal
  ) or not exists (
    select 1 from pg_trigger
     where tgrelid = 'public.sync_changes'::regclass
       and tgname = 'compact_focal_sync_changes_after_insert'
       and not tgisinternal
  ) then
    raise exception 'Focal sync idempotency or compaction trigger is missing';
  end if;

  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'sync_changes'
  ) then
    raise exception 'sync_changes is missing from the Realtime publication';
  end if;

  if not has_table_privilege('authenticated', 'public.sync_changes', 'SELECT')
     or not has_table_privilege('authenticated', 'public.sync_changes', 'INSERT')
     or has_table_privilege('authenticated', 'public.sync_changes', 'UPDATE')
     or has_table_privilege('authenticated', 'public.sync_changes', 'DELETE')
     or has_table_privilege('authenticated', 'public.sync_change_receipts', 'SELECT')
     or has_table_privilege('authenticated', 'public.sync_change_receipts', 'INSERT') then
    raise exception 'Focal sync grants do not match the append-only security model';
  end if;
end;
$$;
