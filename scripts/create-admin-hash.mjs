import bcrypt from "bcryptjs";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

if (!process.stdin.isTTY || !process.stdin.setRawMode) throw new Error("این فرمان را در یک ترمینال تعاملی اجرا کنید.");
process.stdout.write("رمز مدیر (ورودی مخفی): ");
process.stdin.setRawMode(true);
process.stdin.resume();
let password = "";
process.stdin.on("data", async chunk => {
  for (const char of chunk.toString()) {
    if (char === "\u0003") { process.stdout.write("\nلغو شد.\n"); process.exit(1); }
    if (char === "\r" || char === "\n") {
      process.stdin.setRawMode(false); process.stdin.pause(); process.stdout.write("\n");
      if (password.length < 12) { process.stderr.write("رمز باید حداقل ۱۲ نویسه باشد.\n"); process.exit(1); }
      try {
        const envPath = resolve(process.cwd(), ".env.local");
        const hash = (await bcrypt.hash(password, 12)).replaceAll("$", "\\$");
        let contents = await readFile(envPath, "utf8").catch(() => "");
        if (/^\s*ADMIN_PASSWORD_HASH=/m.test(contents)) {
          contents = contents.replace(/^\s*ADMIN_PASSWORD_HASH=.*$/m, `ADMIN_PASSWORD_HASH=${hash}`);
        } else {
          contents = `${contents.trimEnd()}\nADMIN_PASSWORD_HASH=${hash}\n`;
        }
        await writeFile(envPath, contents, { encoding: "utf8", mode: 0o600 });
        process.stdout.write("رمز مدیر در .env.local ذخیره شد. سرور را دوباره راه‌اندازی کنید.\n");
        password = "";
        process.exit(0);
      } catch {
        password = "";
        process.stderr.write("ذخیره‌ی رمز مدیر در .env.local ناموفق بود.\n");
        process.exit(1);
      }
    }
    if (char === "\u007f" || char === "\b") password = password.slice(0, -1);
    else password += char;
  }
});
