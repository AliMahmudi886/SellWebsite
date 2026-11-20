import pg from "pg";
import { readFile } from "node:fs/promises";

const connectionString = process.env.WAL_MONITOR_DATABASE_URL;
if (!connectionString) throw new Error("WAL_MONITOR_DATABASE_URL is required.");
const threshold = Number(process.env.WAL_MAX_PENDING_SECONDS ?? 120);
if (!Number.isSafeInteger(threshold) || threshold < 1 || threshold > 86400) {
  throw new Error("WAL_MAX_PENDING_SECONDS must be an integer from 1 to 86400.");
}
const client = new pg.Client({
  connectionString,
  ssl: process.env.DATABASE_SSL === "true" ? {rejectUnauthorized:true} : undefined,
  connectionTimeoutMillis:5000,
  statement_timeout:5000,
});
try {
  await client.connect();
  await client.query("SELECT set_config('narenj.wal_max_pending_seconds',$1,false)",[String(threshold)]);
  const sql = await readFile(new URL("./db-wal-health.sql",import.meta.url),"utf8");
  const { rows:[{report}] } = await client.query(sql);
  console.log(JSON.stringify(report));
  if (!report.healthy) process.exitCode = 1;
} catch {
  console.error("WAL health probe failed: check the monitoring connection and PostgreSQL grants.");
  process.exitCode = 2;
} finally {
  await client.end();
}
