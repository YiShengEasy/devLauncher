# DevLauncher Sync API

Small private API for DevLauncher cloud sync snapshots.

## Environment

```bash
DATABASE_URL=postgres://devlauncher:devlauncher@127.0.0.1:5432/devlauncher_sync
SYNC_API_PORT=8787
```

## Database

Apply the schema:

```bash
psql "$DATABASE_URL" -f schema.sql
```

## Run

```bash
npm install
npm start
```

Create a sync key:

```bash
curl -sS -X POST http://127.0.0.1:8787/api/sync/keys \
  -H 'content-type: application/json' \
  -d '{"label":"primary"}'
```

The raw `syncKey` is shown once. Store it in DevLauncher settings.
