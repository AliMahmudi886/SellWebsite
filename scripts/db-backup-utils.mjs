import { spawn } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rm, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import pg from "pg";

const cwd = process.cwd();
const backupsDirectory = resolve(cwd, "backups");

export function databaseConfig(database = process.env.POSTGRES_DB) {
  const user = process.env.POSTGRES_USER;
  if (!user || !database) throw new Error("POSTGRES_USER و POSTGRES_DB باید در .env.local تنظیم شده باشند.");
  return { user, database };
}

export async function runDockerDatabaseCommand(args, { inputPath, outputPath, maxOutputBytes = 8 * 1024 * 1024 } = {}) {
  const child = spawn("docker", ["compose", "--env-file", ".env.local", "exec", "-T", "database", ...args], { cwd, windowsHide: true });
  let stderr = "";
  const stdoutChunks = [];
  let stdoutSize = 0;
  const outputTask = outputPath
    ? pipeline(child.stdout, createWriteStream(outputPath, { flags: "wx", mode: 0o600 }))
    : (async () => {
        for await (const chunk of child.stdout) {
          stdoutSize += chunk.length;
          if (stdoutSize > maxOutputBytes) throw new Error("خروجی فرمان Docker از سقف مجاز بیشتر شد.");
          stdoutChunks.push(chunk);
        }
        return Buffer.concat(stdoutChunks);
      })();
  child.stderr.on("data", chunk => { stderr = (stderr + chunk.toString()).slice(-8000); });
  const exitTask = new Promise((resolveExit, rejectExit) => {
    child.once("error", rejectExit);
    child.once("close", (code, signal) => code === 0 ? resolveExit({ code, signal }) : rejectExit(new Error(`فرمان Docker ناموفق بود (${code ?? signal}): ${stderr.trim()}`)));
  });
  const inputTask = inputPath ? pipeline(createReadStream(inputPath), child.stdin) : Promise.resolve(child.stdin.end());
  try {
    const [output] = await Promise.all([outputTask, exitTask, inputTask]);
    return output ?? (outputPath ? undefined : Buffer.concat(stdoutChunks));
  } catch (error) {
    child.kill();
    await Promise.allSettled([outputTask, inputTask, exitTask]);
    if (outputPath) await rm(outputPath, { force: true });
    throw error;
  }
}

export async function validateBackup(backupPath) {
  const absolutePath = resolve(backupPath);
  const details = await stat(absolutePath);
  if (!details.isFile() || details.size < 16) throw new Error("فایل پشتیبان خالی یا نامعتبر است.");
  const listing = await runDockerDatabaseCommand(["pg_restore", "--list"], { inputPath: absolutePath });
  if (!listing?.toString("utf8").includes("TOC Entries")) throw new Error("ساختار فایل پشتیبان PostgreSQL معتبر نیست.");
  return absolutePath;
}

export async function createDatabaseBackup(prefix = "shop") {
  const { user, database } = databaseConfig();
  await mkdir(backupsDirectory, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outputPath = resolve(backupsDirectory, `${prefix}-${timestamp}.dump`);
  try {
    await runDockerDatabaseCommand(["pg_dump", "-U", user, "-d", database, "-Fc", "--no-owner", "--no-privileges"], { outputPath });
    await validateBackup(outputPath);
    return outputPath;
  } catch (error) {
    await rm(outputPath, { force: true });
    throw error;
  }
}

export async function restoreArchiveIntoDatabase(backupPath, database = process.env.POSTGRES_DB) {
  const { user, database: target } = databaseConfig(database);
  const absolutePath = await validateBackup(backupPath);
  await runDockerDatabaseCommand([
    "pg_restore", "--no-owner", "--no-privileges", "--exit-on-error", "--single-transaction",
    "-U", user, "-d", target
  ], { inputPath: absolutePath });
}

function quoteIdentifier(value) { return `"${value.replaceAll('"', '""')}"`; }

export async function restoreDatabaseBackup(backupPath, database = process.env.POSTGRES_DB, connectionString = process.env.DATABASE_URL) {
  const { user, database: target } = databaseConfig(database);
  const sourceUrl = new URL(connectionString || "");
  if (decodeURIComponent(sourceUrl.pathname.slice(1)) !== target) throw new Error("نام دیتابیس در DATABASE_URL با POSTGRES_DB یکی نیست.");
  const safePrefix = target.replace(/[^A-Za-z0-9_]/g, "_").slice(0, 24) || "shop";
  const unique = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const stagingDatabase = `${safePrefix}_restore_${unique}`.slice(0, 63);
  const retainedDatabase = `${safePrefix}_before_${unique}`.slice(0, 63);
  const adminUrl = new URL(sourceUrl);
  adminUrl.pathname = "/postgres";
  const adminPool = new pg.Pool({ connectionString: adminUrl.toString() });
  let stagingCreated = false;
  let currentRenamed = false;
  let swapped = false;
  try {
    await validateBackup(backupPath);
    await runDockerDatabaseCommand(["createdb", "-U", user, stagingDatabase]);
    stagingCreated = true;
    await restoreArchiveIntoDatabase(backupPath, stagingDatabase);
    const verifyUrl = new URL(sourceUrl);
    verifyUrl.pathname = `/${stagingDatabase}`;
    const verifyPool = new pg.Pool({ connectionString: verifyUrl.toString() });
    try {
      const { rows } = await verifyPool.query(`SELECT
        to_regclass('public.products') IS NOT NULL AS products,
        to_regclass('public.categories') IS NOT NULL AS categories,
        to_regclass('public.orders') IS NOT NULL AS orders,
        to_regclass('public.order_items') IS NOT NULL AS order_items,
        to_regclass('public.order_events') IS NOT NULL AS order_events,
        to_regclass('public.schema_migrations') IS NOT NULL AS schema_migrations`);
      if (Object.values(rows[0] ?? {}).some(value => value !== true)) throw new Error("دیتابیس بازیابی‌شده جداول اصلی مورد انتظار را ندارد.");
    } finally {
      await verifyPool.end();
    }

    await adminPool.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()", [target]);
    await adminPool.query(`ALTER DATABASE ${quoteIdentifier(target)} RENAME TO ${quoteIdentifier(retainedDatabase)}`);
    currentRenamed = true;
    try {
      await adminPool.query(`ALTER DATABASE ${quoteIdentifier(stagingDatabase)} RENAME TO ${quoteIdentifier(target)}`);
      swapped = true;
      stagingCreated = false;
    } catch (error) {
      await adminPool.query(`ALTER DATABASE ${quoteIdentifier(retainedDatabase)} RENAME TO ${quoteIdentifier(target)}`);
      currentRenamed = false;
      throw error;
    }
  } finally {
    if (stagingCreated && !swapped) {
      await adminPool.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()", [stagingDatabase]).catch(() => {});
      await adminPool.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(stagingDatabase)}`).catch(() => {});
    }
    await adminPool.end();
  }
  return { retainedDatabase: currentRenamed ? retainedDatabase : undefined };
}
