drop table if exists sync_outbox;
drop table if exists sync_meta;

create table sync_outbox (
  change_id text primary key,
  account_id text not null default '',
  entity text not null,
  row_id text not null,
  operation text not null check (operation in ('put', 'delete')),
  payload text check (payload is null or json_valid(payload)),
  created_at text not null,
  retry_count integer not null default 0,
  last_error text,
  next_attempt_at text,
  unique (account_id, entity, row_id)
);

create index sync_outbox_due_idx on sync_outbox (next_attempt_at, created_at);

-- A delete intent and the matching local removal must be one durable SQLite
-- operation. Otherwise a crash between those writes can resurrect the row.
create trigger sync_outbox_delete_local_record_after_insert
after insert on sync_outbox
when new.operation = 'delete'
  and new.entity in ('projects', 'events', 'study_sessions')
begin
  delete from records where kind = new.entity and id = new.row_id;
end;

create trigger sync_outbox_delete_local_record_after_update
after update of operation, entity, row_id on sync_outbox
when new.operation = 'delete'
  and new.entity in ('projects', 'events', 'study_sessions')
begin
  delete from records where kind = new.entity and id = new.row_id;
end;

create table sync_state (
  key text primary key,
  value text not null check (json_valid(value)),
  updated_at text not null
);
