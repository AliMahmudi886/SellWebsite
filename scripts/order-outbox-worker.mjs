import pg from "pg";
import { dispatchNextOrderEvent } from "./order-outbox-dispatch.mjs";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
const limit = Number(process.env.OUTBOX_BATCH_SIZE ?? 100);
if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) throw new Error("OUTBOX_BATCH_SIZE must be an integer from 1 to 1000.");
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: true } : undefined,
  connectionTimeoutMillis: 5000,
});
const counts = { delivered:0, retry:0, failed:0 };
try {
  for (let i = 0; i < limit; i++) {
    const result = await dispatchNextOrderEvent(pool);
    if (result === "empty") break;
    counts[result]++;
  }
  console.log(JSON.stringify(counts));
  if (counts.failed) process.exitCode = 1;
} finally {
  await pool.end();
}
