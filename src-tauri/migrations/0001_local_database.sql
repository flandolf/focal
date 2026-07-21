
            create table if not exists records (
                kind text not null check (kind in ('projects', 'events', 'study_sessions')),
                id text not null,
                payload text not null check (json_valid(payload)),
                position integer not null default 0,
                updated_at text generated always as (
                    coalesce(json_extract(payload, '$.updated_at'), json_extract(payload, '$.created_at'), '')
                ) virtual,
                start_time text generated always as (json_extract(payload, '$.startTime')) virtual,
                deadline text generated always as (json_extract(payload, '$.deadline')) virtual,
                project_id text generated always as (json_extract(payload, '$.projectId')) virtual,
                status text generated always as (json_extract(payload, '$.status')) virtual,
                primary key (kind, id)
            );
            create index if not exists records_kind_position_idx on records (kind, position);
            create index if not exists records_kind_updated_idx on records (kind, updated_at);
            create index if not exists records_kind_start_idx on records (kind, start_time);
            create index if not exists records_kind_deadline_idx on records (kind, deadline);
            create index if not exists records_kind_project_idx on records (kind, project_id);
            create index if not exists records_kind_status_idx on records (kind, status);

            create table if not exists preferences (
                key text primary key,
                value text not null check (json_valid(value)),
                syncable integer not null default 0 check (syncable in (0, 1)),
                updated_at text not null
            );

            create table if not exists sync_outbox (
                id text primary key,
                table_name text not null,
                operation text not null check (operation in ('upsert', 'soft_delete')),
                row_id text not null,
                payload text not null check (json_valid(payload)),
                created_at text not null,
                updated_at text not null,
                retry_count integer not null default 0,
                last_error text,
                next_attempt_at text,
                unique (table_name, row_id)
            );
            create index if not exists sync_outbox_due_idx on sync_outbox (next_attempt_at, created_at);

            create table if not exists sync_meta (
                key text primary key,
                value text not null check (json_valid(value)),
                updated_at text not null
            );

            create table if not exists legacy_imports (
                source text primary key,
                imported_at text not null,
                item_count integer not null default 0
            );
