-- Allow delete operations to carry non-secret integration tombstone metadata.
-- This lets every device archive the matching Notion page without guessing from
-- a temporarily incomplete local snapshot.
alter table public.sync_changes
  drop constraint if exists sync_changes_payload_check;

alter table public.sync_changes
  add constraint sync_changes_payload_check check (
    (operation = 'put' and payload is not null)
    or (operation = 'delete' and (payload is null or jsonb_typeof(payload) = 'object'))
  );

create index if not exists sync_change_receipts_accepted_idx
  on public.sync_change_receipts (accepted_at);

create or replace function public.prune_old_focal_sync_receipts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- ponytail: receipt pruning is opportunistic and deliberately conservative.
  -- A current client dead-letters a failed change within minutes; 180 days also
  -- leaves ample room for older clients and long-offline installs.
  if mod(new.revision, 1000) = 0 then
    delete from public.sync_change_receipts receipt
     where receipt.accepted_at < now() - interval '180 days'
       and not exists (
         select 1 from public.sync_changes existing_change
          where existing_change.user_id = receipt.user_id
            and existing_change.change_id = receipt.change_id
       );
  end if;
  return new;
end;
$$;

revoke all on function public.prune_old_focal_sync_receipts() from public;

drop trigger if exists prune_old_focal_sync_receipts_after_insert
  on public.sync_changes;
create trigger prune_old_focal_sync_receipts_after_insert
after insert on public.sync_changes
for each row execute function public.prune_old_focal_sync_receipts();
