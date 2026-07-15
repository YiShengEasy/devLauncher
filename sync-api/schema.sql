create table if not exists sync_keys (
  id uuid primary key,
  key_hash text not null unique,
  label text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create table if not exists sync_snapshots (
  id uuid primary key,
  sync_key_id uuid not null references sync_keys(id) on delete cascade,
  device_name text,
  app_version text,
  schema_version integer not null,
  content_hash text not null,
  keyboard_config jsonb not null,
  quickmemory_data jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists sync_snapshots_key_created_idx
  on sync_snapshots(sync_key_id, created_at desc);
