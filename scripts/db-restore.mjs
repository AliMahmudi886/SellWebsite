import { resolve } from "node:path";
import { createDatabaseBackup, databaseConfig, restoreDatabaseBackup, validateBackup } from "./db-backup-utils.mjs";

const [backupArgument, confirmationFlag, confirmedDatabase] = process.argv.slice(2);
const database = process.env.POSTGRES_DB;
if (!backupArgument || confirmationFlag !== "--confirm" || confirmedDatabase !== database) {
  console.error("برای بازیابی، مسیر فایل و نام دیتابیس را صریح وارد کنید:");
  console.error("npm run db:restore -- backups/shop-....dump --confirm sellwebsite");
  process.exit(2);
}

try {
  databaseConfig(database);
  const backupPath = await validateBackup(resolve(backupArgument));
  console.log(`فایل پشتیبان معتبر است: ${backupPath}`);
  console.log("ابتدا پشتیبان ایمنی از دیتابیس فعلی ساخته می‌شود...");
  const safetyBackup = await createDatabaseBackup("pre-restore");
  console.log(`پشتیبان ایمنی: ${safetyBackup}`);
  console.log("در حال restore در دیتابیس موقت و بررسی جداول؛ برنامه را تا پایان متوقف نگه دارید...");
  const result = await restoreDatabaseBackup(backupPath, database);
  console.log("بازیابی کامل شد؛ دیتابیس قبلی برای rollback فوری حفظ شده است.");
  console.log(`دیتابیس قبلی: ${result.retainedDatabase}`);
  console.log("پس از بررسی نسخه، migrationها و smoke test را اجرا کنید؛ دیتابیس قبلی را فقط بعد از تأیید پاک کنید.");
} catch (error) {
  console.error(error instanceof Error ? error.message : "بازیابی ناموفق بود.");
  console.error("اگر بازیابی کامل نشد، فایل pre-restore را برای بازگرداندن دیتابیس فعلی نگه دارید.");
  process.exitCode = 1;
}
