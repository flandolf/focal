alter table public.study_sessions
  add column if not exists schema_version integer not null default 1,
  add column if not exists payload jsonb not null default '{}'::jsonb;

comment on column public.study_sessions.payload is
  'Versioned canonical study-session document. Legacy columns remain populated during the V2 compatibility window.';
