import { createDatabaseBackup } from "./db-backup-utils.mjs";

try {
  const backup = await createDatabaseBackup();
  console.log(`پشتیبان ساخته و ساختارش بررسی شد: ${backup}`);
  console.log("این فایل شامل اطلاعات سفارش‌هاست؛ آن را خصوصی و امن نگه دارید.");
} catch (error) {
  console.error(error instanceof Error ? error.message : "ساخت پشتیبان ناموفق بود.");
  process.exitCode = 1;
}
