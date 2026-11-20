import pg from "pg";
import { setTimeout as delay } from "node:timers/promises";
import { dispatchNextOrderEvent } from "./order-outbox-dispatch.mjs";
import { outboxHealth, readOutboxStatus, requeueFailedOutboxEvent } from "./order-outbox-ops.mjs";

const [action = "dispatch", eventId, ...extra] = process.argv.slice(2);
if (!["dispatch","watch","status","health","requeue"].includes(action) || extra.length || (action === "requeue") !== Boolean(eventId)) {
  throw new Error("Usage: dispatch | watch | status | health | requeue <event UUID>");
}
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");

function integerSetting(name, fallback, min, max) {
  const number = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(number) || number < min || number > max) {
    throw new Error(name + " must be an integer from " + min + " to " + max + ".");
  }
  return number;
}

const limit = integerSetting("OUTBOX_BATCH_SIZE", 100, 1, 1000);
const interval = integerSetting("OUTBOX_POLL_MS", 5000, 250, 60_000);
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: true } : undefined,
  connectionTimeoutMillis: 5000,
  statement_timeout: 10_000,
});
const stop = new AbortController();
const shutdown = () => stop.abort();

async function dispatchBatch() {
  const counts = { delivered:0, retry:0, failed:0 };
  for (let i = 0; i < limit && !stop.signal.aborted; i++) {
    const result = await dispatchNextOrderEvent(pool);
    if (result === "empty") break;
    counts[result]++;
  }
  return counts;
}

try {
  if (action === "status") {
    console.log(JSON.stringify(await readOutboxStatus(pool)));
  } else if (action === "health") {
    const threshold = integerSetting("OUTBOX_MAX_READY_AGE_SECONDS", 120, 1, 86_400);
    const health = outboxHealth(await readOutboxStatus(pool), threshold);
    console.log(JSON.stringify(health));
    if (!health.healthy) process.exitCode = 1;
  } else if (action === "requeue") {
    const requeued = await requeueFailedOutboxEvent(pool, eventId);
    console.log(JSON.stringify({ requeued }));
    if (!requeued) process.exitCode = 1;
  } else if (action === "watch") {
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
    while (!stop.signal.aborted) {
      try {
        const counts = await dispatchBatch();
        if (counts.delivered || counts.retry || counts.failed) console.log(JSON.stringify(counts));
      } catch {
        console.error("Outbox database operation failed; polling will resume.");
      }
      try {
        await delay(interval, undefined, { signal: stop.signal });
      } catch (error) {
        if (error.name !== "AbortError") throw error;
      }
    }
  } else {
    const counts = await dispatchBatch();
    console.log(JSON.stringify(counts));
    if (counts.failed) process.exitCode = 1;
  }
} finally {
  process.off("SIGINT", shutdown);
  process.off("SIGTERM", shutdown);
  await pool.end();
}
