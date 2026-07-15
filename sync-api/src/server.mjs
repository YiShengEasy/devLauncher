import crypto from "node:crypto";
import http from "node:http";
import { promisify } from "node:util";
import pg from "pg";

const { Pool } = pg;
const scrypt = promisify(crypto.scrypt);

const PORT = Number(process.env.SYNC_API_PORT ?? "8787");
const DATABASE_URL = process.env.DATABASE_URL;
const MAX_BODY_BYTES = 2 * 1024 * 1024;

if (!DATABASE_URL) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL });

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(payload);
}

function notFound(res) {
  json(res, 404, { error: "not_found" });
}

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      const error = new Error("request body too large");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }

  if (chunks.length === 0) return {};

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    const error = new Error("invalid json");
    error.statusCode = 400;
    throw error;
  }
}

function getBearerToken(req) {
  const header = req.headers.authorization ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1]?.trim() ?? "";
}

function createSyncKey() {
  return `dlsk_${crypto.randomBytes(32).toString("base64url")}`;
}

async function hashSyncKey(syncKey) {
  const salt = crypto.randomBytes(16).toString("base64url");
  const derived = await scrypt(syncKey, salt, 32);
  return `scrypt$v1$${salt}$${derived.toString("base64url")}`;
}

async function verifySyncKey(syncKey, storedHash) {
  const parts = storedHash.split("$");
  if (parts.length !== 4 || parts[0] !== "scrypt" || parts[1] !== "v1") {
    return false;
  }
  const [, , salt, expected] = parts;
  const derived = await scrypt(syncKey, salt, 32);
  const expectedBuffer = Buffer.from(expected, "base64url");
  return derived.length === expectedBuffer.length && crypto.timingSafeEqual(derived, expectedBuffer);
}

async function authenticate(req) {
  const token = getBearerToken(req);
  if (!token) return null;

  const { rows } = await pool.query("select id, key_hash from sync_keys order by created_at desc");
  for (const row of rows) {
    if (await verifySyncKey(token, row.key_hash)) {
      await pool.query("update sync_keys set last_used_at = now() where id = $1", [row.id]);
      return { id: row.id };
    }
  }
  return null;
}

function validateSnapshotBody(body) {
  if (!body || typeof body !== "object") return "payload must be an object";
  if (body.schemaVersion !== 1) return "schemaVersion must be 1";
  if (!body.keyboardConfig || typeof body.keyboardConfig !== "object") return "keyboardConfig must be an object";
  if (!body.quickmemoryData || typeof body.quickmemoryData !== "object") return "quickmemoryData must be an object";
  return null;
}

function snapshotResponse(row, includePayload) {
  const base = {
    id: row.id,
    schemaVersion: row.schema_version,
    deviceName: row.device_name,
    appVersion: row.app_version,
    contentHash: row.content_hash,
    createdAt: row.created_at,
  };

  if (!includePayload) return base;

  return {
    ...base,
    keyboardConfig: row.keyboard_config,
    quickmemoryData: row.quickmemory_data,
  };
}

async function createKey(req, res) {
  const body = await readJson(req);
  const syncKey = typeof body.syncKey === "string" && body.syncKey.trim() ? body.syncKey.trim() : createSyncKey();
  const label = typeof body.label === "string" && body.label.trim() ? body.label.trim().slice(0, 120) : null;
  const id = crypto.randomUUID();
  const keyHash = await hashSyncKey(syncKey);

  await pool.query("insert into sync_keys (id, key_hash, label) values ($1, $2, $3)", [id, keyHash, label]);
  json(res, 201, { id, syncKey, label });
}

async function status(req, res) {
  const key = await authenticate(req);
  if (!key) return json(res, 401, { error: "invalid_sync_key" });

  const { rows } = await pool.query(
    `select id, schema_version, device_name, app_version, content_hash, created_at
       from sync_snapshots
      where sync_key_id = $1
      order by created_at desc
      limit 1`,
    [key.id],
  );

  json(res, 200, { latestSnapshot: rows[0] ? snapshotResponse(rows[0], false) : null });
}

async function createSnapshot(req, res) {
  const key = await authenticate(req);
  if (!key) return json(res, 401, { error: "invalid_sync_key" });

  const body = await readJson(req);
  const validationError = validateSnapshotBody(body);
  if (validationError) return json(res, 400, { error: "invalid_snapshot", message: validationError });

  const id = crypto.randomUUID();
  const deviceName = typeof body.deviceName === "string" ? body.deviceName.slice(0, 160) : null;
  const appVersion = typeof body.appVersion === "string" ? body.appVersion.slice(0, 80) : null;
  const contentHash = typeof body.contentHash === "string" && body.contentHash
    ? body.contentHash
    : crypto.createHash("sha256").update(JSON.stringify(body)).digest("hex");

  const { rows } = await pool.query(
    `insert into sync_snapshots (
       id, sync_key_id, device_name, app_version, schema_version,
       content_hash, keyboard_config, quickmemory_data
     ) values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb)
     returning id, schema_version, device_name, app_version, content_hash, created_at`,
    [
      id,
      key.id,
      deviceName,
      appVersion,
      body.schemaVersion,
      contentHash,
      JSON.stringify(body.keyboardConfig),
      JSON.stringify(body.quickmemoryData),
    ],
  );

  json(res, 201, { snapshot: snapshotResponse(rows[0], false) });
}

async function latestSnapshot(req, res) {
  const key = await authenticate(req);
  if (!key) return json(res, 401, { error: "invalid_sync_key" });

  const { rows } = await pool.query(
    `select id, schema_version, device_name, app_version, content_hash,
            keyboard_config, quickmemory_data, created_at
       from sync_snapshots
      where sync_key_id = $1
      order by created_at desc
      limit 1`,
    [key.id],
  );

  if (!rows[0]) return json(res, 404, { error: "snapshot_not_found" });
  json(res, 200, { snapshot: snapshotResponse(rows[0], true) });
}

async function route(req, res) {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");

  if (req.method === "GET" && url.pathname === "/healthz") {
    return json(res, 200, { ok: true });
  }
  if (req.method === "POST" && url.pathname === "/api/sync/keys") {
    return createKey(req, res);
  }
  if (req.method === "GET" && url.pathname === "/api/sync/status") {
    return status(req, res);
  }
  if (req.method === "POST" && url.pathname === "/api/sync/snapshots") {
    return createSnapshot(req, res);
  }
  if (req.method === "GET" && url.pathname === "/api/sync/snapshots/latest") {
    return latestSnapshot(req, res);
  }

  return notFound(res);
}

const server = http.createServer(async (req, res) => {
  try {
    await route(req, res);
  } catch (error) {
    const statusCode = Number(error.statusCode) || 500;
    json(res, statusCode, { error: statusCode >= 500 ? "internal_server_error" : error.message });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`DevLauncher sync API listening on ${PORT}`);
});
