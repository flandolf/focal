alter table sync_outbox add column blocked_at text;

create table sync_inbox (
  account_id text not null,
  entity text not null,
  row_id text not null,
  change_id text not null,
  device_id text not null,
  operation text not null check (operation in ('put', 'delete')),
  payload text check (payload is null or json_valid(payload)),
  revision integer not null,
  created_at text not null,
  primary key (account_id, entity, row_id)
);

create index sync_inbox_account_revision_idx
  on sync_inbox (account_id, revision);

create table sync_local_context (
  singleton integer primary key check (singleton = 1),
  account_id text not null default '',
  last_account_id text not null default ''
);

insert into sync_local_context (singleton, account_id, last_account_id)
values (1, '', '')
on conflict (singleton) do nothing;

create table sync_record_suppress (
  entity text not null,
  row_id text not null,
  payload text not null check (json_valid(payload)),
  primary key (entity, row_id)
);

-- Capture every durable local record write in the same SQLite statement. The
-- explicit TypeScript enqueue remains as a harmless coalescing compatibility
-- layer for callers that also need immediate status updates.
create trigger records_enqueue_sync_after_insert
after insert on records
begin
  insert into sync_outbox (
    change_id, account_id, entity, row_id, operation, payload, created_at,
    retry_count, last_error, next_attempt_at, blocked_at
  )
  select
    lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-' ||
      lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(2))) || '-' ||
      lower(hex(randomblob(6))),
    account_id,
    new.kind,
    new.id,
    'put',
    new.payload,
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    0,
    null,
    null,
    null
  from sync_local_context
  where singleton = 1
    and not exists (
      select 1 from sync_record_suppress
       where entity = new.kind and row_id = new.id and payload = new.payload
    )
  on conflict (account_id, entity, row_id) do update set
    change_id = excluded.change_id,
    operation = excluded.operation,
    payload = excluded.payload,
    created_at = excluded.created_at,
    retry_count = 0,
    last_error = null,
    next_attempt_at = null,
    blocked_at = null;

  delete from sync_record_suppress
   where entity = new.kind and row_id = new.id and payload = new.payload;
end;

create trigger records_enqueue_sync_after_payload_update
after update of payload on records
when old.payload <> new.payload
begin
  insert into sync_outbox (
    change_id, account_id, entity, row_id, operation, payload, created_at,
    retry_count, last_error, next_attempt_at, blocked_at
  )
  select
    lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-' ||
      lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(2))) || '-' ||
      lower(hex(randomblob(6))),
    account_id,
    new.kind,
    new.id,
    'put',
    new.payload,
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    0,
    null,
    null,
    null
  from sync_local_context
  where singleton = 1
    and not exists (
      select 1 from sync_record_suppress
       where entity = new.kind and row_id = new.id and payload = new.payload
    )
  on conflict (account_id, entity, row_id) do update set
    change_id = excluded.change_id,
    operation = excluded.operation,
    payload = excluded.payload,
    created_at = excluded.created_at,
    retry_count = 0,
    last_error = null,
    next_attempt_at = null,
    blocked_at = null;

  delete from sync_record_suppress
   where entity = new.kind and row_id = new.id and payload = new.payload;
end;

create table notion_outbox (
  data_source_id text not null,
  kind text not null check (kind in ('event', 'session')),
  local_id text not null,
  operation text not null check (operation in ('upsert', 'archive')),
  page_id text,
  created_at text not null,
  not_before text,
  retry_count integer not null default 0,
  last_error text,
  next_attempt_at text,
  primary key (data_source_id, kind, local_id)
);

create index notion_outbox_due_idx
  on notion_outbox (next_attempt_at, not_before, created_at);

-- Existing installations predate the durable Notion outbox. Queue one
-- comparison pass so an edit made immediately before upgrading is not missed.
insert into notion_outbox (
  data_source_id, kind, local_id, operation, page_id, created_at,
  not_before, retry_count, last_error, next_attempt_at
)
select
  notion.data_source_id,
  case records.kind when 'events' then 'event' else 'session' end,
  records.id,
  'upsert',
  case
    when json_extract(records.payload, '$.source.type') = 'notion'
    then json_extract(records.payload, '$.source.id')
    else null
  end,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  null,
  0,
  null,
  null
from records
cross join (
  select coalesce(json_extract(value, '$'), '') as data_source_id
    from preferences
   where key = 'focal-notion-data-source-id'
   limit 1
) as notion
where records.kind in ('events', 'study_sessions')
  and notion.data_source_id <> ''
  and coalesce(json_extract(records.payload, '$.source.type'), '') <> 'vcaa';

create trigger records_enqueue_notion_after_insert
after insert on records
when new.kind in ('events', 'study_sessions')
  and coalesce(json_extract(new.payload, '$.source.type'), '') <> 'vcaa'
  and coalesce(
    json_extract((select value from preferences where key = 'focal-notion-data-source-id'), '$'),
    ''
  ) <> ''
begin
  insert into notion_outbox (
    data_source_id, kind, local_id, operation, page_id, created_at,
    not_before, retry_count, last_error, next_attempt_at
  ) values (
    coalesce(
      json_extract((select value from preferences where key = 'focal-notion-data-source-id'), '$'),
      (select data_source_id from notion_outbox
        where kind = case new.kind when 'events' then 'event' else 'session' end
          and local_id = new.id limit 1),
      ''
    ),
    case new.kind when 'events' then 'event' else 'session' end,
    new.id,
    'upsert',
    json_extract(new.payload, '$.source.id'),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    null,
    0,
    null,
    null
  )
  on conflict (data_source_id, kind, local_id) do update set
    operation = 'upsert',
    page_id = excluded.page_id,
    created_at = excluded.created_at,
    not_before = null,
    retry_count = 0,
    last_error = null,
    next_attempt_at = null;
end;

create trigger records_enqueue_notion_after_payload_update
after update of payload on records
when old.payload <> new.payload
  and new.kind in ('events', 'study_sessions')
  and coalesce(json_extract(new.payload, '$.source.type'), '') <> 'vcaa'
  and coalesce(
    json_extract((select value from preferences where key = 'focal-notion-data-source-id'), '$'),
    ''
  ) <> ''
begin
  insert into notion_outbox (
    data_source_id, kind, local_id, operation, page_id, created_at,
    not_before, retry_count, last_error, next_attempt_at
  ) values (
    coalesce(
      json_extract((select value from preferences where key = 'focal-notion-data-source-id'), '$'),
      (select data_source_id from notion_outbox
        where kind = case new.kind when 'events' then 'event' else 'session' end
          and local_id = new.id limit 1),
      ''
    ),
    case new.kind when 'events' then 'event' else 'session' end,
    new.id,
    'upsert',
    json_extract(new.payload, '$.source.id'),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    null,
    0,
    null,
    null
  )
  on conflict (data_source_id, kind, local_id) do update set
    operation = 'upsert',
    page_id = excluded.page_id,
    created_at = excluded.created_at,
    not_before = null,
    retry_count = 0,
    last_error = null,
    next_attempt_at = null;
end;

create trigger sync_outbox_enqueue_notion_archive_after_insert
after insert on sync_outbox
when new.operation = 'delete'
  and json_extract(new.payload, '$.notion.pageId') is not null
begin
  insert into notion_outbox (
    data_source_id, kind, local_id, operation, page_id, created_at,
    not_before, retry_count, last_error, next_attempt_at
  ) values (
    coalesce(json_extract(new.payload, '$.notion.dataSourceId'), ''),
    json_extract(new.payload, '$.notion.kind'),
    new.row_id,
    'archive',
    json_extract(new.payload, '$.notion.pageId'),
    new.created_at,
    strftime('%Y-%m-%dT%H:%M:%fZ', new.created_at, '+8 seconds'),
    0,
    null,
    null
  )
  on conflict (data_source_id, kind, local_id) do update set
    operation = 'archive',
    page_id = excluded.page_id,
    created_at = excluded.created_at,
    not_before = excluded.not_before,
    retry_count = 0,
    last_error = null,
    next_attempt_at = null;
end;

create trigger sync_outbox_enqueue_notion_archive_after_update
after update of operation, payload on sync_outbox
when new.operation = 'delete'
  and json_extract(new.payload, '$.notion.pageId') is not null
begin
  insert into notion_outbox (
    data_source_id, kind, local_id, operation, page_id, created_at,
    not_before, retry_count, last_error, next_attempt_at
  ) values (
    coalesce(json_extract(new.payload, '$.notion.dataSourceId'), ''),
    json_extract(new.payload, '$.notion.kind'),
    new.row_id,
    'archive',
    json_extract(new.payload, '$.notion.pageId'),
    new.created_at,
    strftime('%Y-%m-%dT%H:%M:%fZ', new.created_at, '+8 seconds'),
    0,
    null,
    null
  )
  on conflict (data_source_id, kind, local_id) do update set
    operation = 'archive',
    page_id = excluded.page_id,
    created_at = excluded.created_at,
    not_before = excluded.not_before,
    retry_count = 0,
    last_error = null,
    next_attempt_at = null;
end;
