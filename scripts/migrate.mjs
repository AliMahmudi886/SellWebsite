import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import pg from "pg";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL تنظیم نشده است.");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: true } : undefined });
try {
  await pool.query("CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
  const migrations = (await readdir(resolve("db/migrations"))).filter(name=>name.endsWith(".sql")).sort();
  for (const name of migrations) {
    const { rowCount } = await pool.query("SELECT 1 FROM schema_migrations WHERE name = $1", [name]);
    if (rowCount) { console.log(`Migration ${name} already applied.`); continue; }
    const sql = await readFile(resolve("db/migrations", name), "utf8");
    const client = await pool.connect();
    try { await client.query("BEGIN"); await client.query(sql); await client.query("INSERT INTO schema_migrations(name) VALUES ($1)", [name]); await client.query("COMMIT"); }
    catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
    console.log(`Migration ${name} applied.`);
  }
} finally { await pool.end(); }
