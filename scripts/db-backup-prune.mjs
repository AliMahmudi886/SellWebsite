import { readdir, rm, stat } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { validateBackup } from "./db-backup-utils.mjs";

const backupDirectory = resolve(process.cwd(), "backups");
const args = process.argv.slice(2);
const keepIndex = args.indexOf("--keep");
const keep = keepIndex >= 0 ? Number(args[keepIndex + 1]) : 10;
const apply = args.includes("--apply");
const confirmed = args.includes("--confirm-delete");
if (!Number.isInteger(keep) || keep < 1 || keep > 1000) throw new Error("--keep باید عددی بین ۱ تا ۱۰۰۰ باشد.");
if (apply && !confirmed) throw new Error("برای حذف فایل‌ها هر دو گزینه‌ی --apply و --confirm-delete لازم‌اند.");

const entries = await readdir(backupDirectory, { withFileTypes: true }).catch(error => error.code === "ENOENT" ? [] : Promise.reject(error));
const files = [];
for (const entry of entries) {
  if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".dump")) continue;
  const path = resolve(backupDirectory, entry.name);
  if (dirname(path) !== backupDirectory) continue;
  files.push({ path, name: entry.name, info: await stat(path) });
}
files.sort((a, b) => b.info.mtimeMs - a.info.mtimeMs || b.name.localeCompare(a.name));

const valid = [];
const invalid = [];
for (const file of files) {
  try {
    await validateBackup(file.path);
    valid.push(file);
    console.log(`معتبر: ${file.name}`);
  } catch (error) {
    invalid.push(file);
    console.log(`نامعتبر یا غیرقابل بررسی؛ نگه داشته می‌شود: ${file.name} (${error instanceof Error ? error.message : "خطا"})`);
  }
}

const retained = valid.slice(0, keep);
const candidates = valid.slice(keep);
console.log(`نسخه‌های معتبر: ${valid.length} · نگه‌داری: ${retained.length} · نامعتبر و محفوظ: ${invalid.length}`);
if (candidates.length === 0) {
  console.log("فایلی برای پاک‌سازی پیشنهاد نمی‌شود.");
} else if (!apply) {
  console.log("پیشنهاد پاک‌سازی (فقط پیش‌نمایش؛ هیچ فایلی حذف نشد):");
  for (const file of candidates) console.log(`  ${file.name}`);
  console.log(`برای تأیید حذف همین گروه اجرا کنید: npm run db:backup:prune -- --keep ${keep} --apply --confirm-delete`);
} else {
  let removed = 0;
  for (const file of candidates) {
    const current = await stat(file.path).catch(() => null);
    if (!current || current.size !== file.info.size || current.mtimeMs !== file.info.mtimeMs) {
      console.log(`تغییر کرده و حذف نشد: ${file.name}`);
      continue;
    }
    await rm(file.path);
    removed++;
    console.log(`حذف شد: ${file.name}`);
  }
  console.log(`پاک‌سازی تمام شد؛ ${removed} فایل حذف شد.`);
}
