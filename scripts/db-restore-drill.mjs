import pg from "pg";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { restoreReferencedMedia, snapshotReferencedMedia } from "./db-media-backup.mjs";
import {
  createDatabaseBackup,
  databaseConfig,
  restoreArchiveIntoDatabase,
  runDockerDatabaseCommand,
} from "./db-backup-utils.mjs";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL باید تنظیم شده باشد.");
const { user, database } = databaseConfig();
const sourceUrl = new URL(process.env.DATABASE_URL);
if (!["localhost", "127.0.0.1", "[::1]"].includes(sourceUrl.hostname) ||
    sourceUrl.port !== "5433" || decodeURIComponent(sourceUrl.pathname.slice(1)) !== database) {
  throw new Error("تمرین بازیابی فقط برای PostgreSQL محلی Compose روی پورت 5433 و دیتابیس منطبق مجاز است.");
}

const databaseName = `restore_drill_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
const restoredUrl = new URL(sourceUrl);
restoredUrl.pathname = `/${databaseName}`;
let created = false;
const startedAt = performance.now();

try {
  const backupPath = await createDatabaseBackup("restore-drill");
  await runDockerDatabaseCommand(["createdb", "-U", user, databaseName]);
  created = true;
  const restoreStartedAt = performance.now();
  await restoreArchiveIntoDatabase(backupPath, databaseName);
  const restoredPool = new pg.Pool({ connectionString: restoredUrl.toString(), connectionTimeoutMillis: 5000 });
  try {
    const { rows: [counts] } = await restoredPool.query(`SELECT
      (SELECT count(*) FROM products) AS products,
      (SELECT count(*) FROM categories) AS categories,
      (SELECT count(*) FROM orders) AS orders,
      (SELECT count(*) FROM order_items) AS order_items,
      (SELECT count(*) FROM order_events) AS order_events,
      (SELECT count(*) FROM schema_migrations) AS migrations,
      (SELECT count(*) FROM order_outbox) AS outbox_events,
      (SELECT count(*) FROM order_event_inbox) AS inbox_receipts`);
    const { rows: [integrity] } = await restoredPool.query(`SELECT
      (SELECT count(*) FROM products WHERE stock < 0) AS negative_stock,
      (SELECT count(*) FROM order_outbox o
        LEFT JOIN order_event_inbox i ON i.event_id = o.id
        WHERE o.published_at IS NOT NULL AND i.event_id IS NULL) AS published_without_receipt,
      (SELECT count(*) FROM order_outbox
        WHERE published_at IS NOT NULL AND failed_at IS NOT NULL) AS published_and_failed`);
    if (Object.values(integrity).some(value => Number(value) !== 0)) {
      throw new Error(`یکپارچگی دیتابیس بازیابی‌شده تأیید نشد: ${JSON.stringify(integrity)}`);
    }
    const { rows: assets } = await restoredPool.query(
      "SELECT DISTINCT image FROM products WHERE image LIKE '/api/media/%'",
    );
    const references = assets.map(row => row.image.slice("/api/media/".length));
    const mediaSnapshot = backupPath + ".media";
    await snapshotReferencedMedia(resolve("storage/uploads"), mediaSnapshot, references, basename(backupPath));
    const temporary = await mkdtemp(join(tmpdir(),"narenj-restore-"));
    let media;
    try {
      media = await restoreReferencedMedia(mediaSnapshot,join(temporary,"uploads"),references,basename(backupPath));
    } finally {
      await rm(temporary,{recursive:true,force:true});
    }
    console.log(JSON.stringify({
      database: databaseName,
      counts,
      integrity,
      media,
      restore_and_verify_seconds: Number(((performance.now() - restoreStartedAt) / 1000).toFixed(3)),
      drill_seconds_before_cleanup: Number(((performance.now() - startedAt) / 1000).toFixed(3)),
    }));
    console.log(`فایل پشتیبان تأییدشده برای نگهداری: ${backupPath}`);
    console.log(`پوشهٔ پشتیبان رسانه: ${mediaSnapshot}`);
  } finally {
    await restoredPool.end();
  }
} finally {
  if (created) {
    await runDockerDatabaseCommand(["dropdb", "-U", user, "--if-exists", databaseName]);
  }
}
