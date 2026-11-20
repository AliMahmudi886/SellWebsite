import pg from "pg";
import { randomUUID } from "node:crypto";
import { createDatabaseBackup, databaseConfig, restoreDatabaseBackup, runDockerDatabaseCommand } from "./db-backup-utils.mjs";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL باید تنظیم شده باشد.");
const { user } = databaseConfig();
const databaseName = `restore_drill_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
const sourceUrl = new URL(process.env.DATABASE_URL);
const adminUrl = new URL(sourceUrl);
adminUrl.pathname = "/postgres";
const restoredUrl = new URL(sourceUrl);
restoredUrl.pathname = `/${databaseName}`;
const controlPool = new pg.Pool({ connectionString: adminUrl.toString() });
let created = false;
let retainedDatabase;

try {
  const backupPath = await createDatabaseBackup("restore-drill");
  await runDockerDatabaseCommand(["createdb", "-U", user, databaseName]);
  created = true;
  const restored = await restoreDatabaseBackup(backupPath, databaseName, restoredUrl.toString());
  retainedDatabase = restored.retainedDatabase;
  const restoredPool = new pg.Pool({ connectionString: restoredUrl.toString() });
  try {
    const { rows } = await restoredPool.query(`SELECT
      (SELECT count(*)::int FROM products) AS products,
      (SELECT count(*)::int FROM categories) AS categories,
      (SELECT count(*)::int FROM orders) AS orders,
      (SELECT count(*)::int FROM order_items) AS order_items,
      (SELECT count(*)::int FROM order_events) AS order_events`);
    console.log(`بازیابی آزمایشی در دیتابیس جداگانه موفق بود: ${JSON.stringify(rows[0])}`);
    console.log(`فایل پشتیبان تأییدشده برای نگهداری: ${backupPath}`);
  } finally {
    await restoredPool.end();
  }
} finally {
  if (created) {
    for (const name of [databaseName, retainedDatabase].filter(Boolean)) {
      await controlPool.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()", [name]);
      await controlPool.query(`DROP DATABASE IF EXISTS "${name}"`);
    }
  }
  await controlPool.end();
}
