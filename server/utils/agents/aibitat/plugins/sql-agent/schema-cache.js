// schema-cache.js
// Simple in-memory cache. Keyed by conversation/caller (best effort).
// NOTE: resets on server restart, which is fine for demo + most sessions.

const byThread = new Map(); // threadKey -> Set("db:table")

function getThreadKey(ctx) {
  // Best-effort stable key. Adjust if you have a known thread id.
  return ctx?.caller || ctx?.super?.caller || "global";
}

function markSchemaKnown(ctx, database_id, table_name) {
  const key = getThreadKey(ctx);
  if (!byThread.has(key)) byThread.set(key, new Set());
  byThread.get(key).add(`${database_id}:${String(table_name).toLowerCase()}`);
}

function hasSchema(ctx, database_id, table_name) {
  const key = getThreadKey(ctx);
  const set = byThread.get(key);
  if (!set) return false;
  return set.has(`${database_id}:${String(table_name).toLowerCase()}`);
}

module.exports = { markSchemaKnown, hasSchema };
