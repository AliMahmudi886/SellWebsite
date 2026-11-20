import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminSession, validOrigin } from "@/lib/auth";
import { clearRateLimit, consumeRateLimit } from "@/lib/rate-limit";

import { decodeTotpSecret, digest, matchTotp } from "@/lib/admin-mfa";
import { permissionsFor } from "@/lib/admin-permissions";
import { readBoundedText, RequestBodyTooLarge } from "@/lib/request-body";

const schema = z.object({ email: z.string().email().max(254), password: z.string().min(1).max(200), mfaCode: z.string().trim().max(64).optional() });
export async function POST(request: Request) {
  if (!validOrigin(request)) return NextResponse.json({ error: "درخواست معتبر نیست." }, { status: 403 });
  let body: z.infer<typeof schema>;
  try { const parsed = schema.safeParse(JSON.parse(await readBoundedText(request, 4096))); if (!parsed.success) return NextResponse.json({ error: "ایمیل یا رمز عبور نادرست است." }, { status: 400 }); body = parsed.data; }
  catch (error) { return NextResponse.json({ error: "درخواست معتبر نیست." }, { status: error instanceof RequestBodyTooLarge ? 413 : 400 }); }
  let rateLimit: Awaited<ReturnType<typeof consumeRateLimit>>;
  try { rateLimit = await consumeRateLimit("admin-login", request, 8, 10 * 60_000); }
  catch { return NextResponse.json({ error: "ورود موقتاً در دسترس نیست." }, { status: 503 }); }
  if (!rateLimit.allowed) return NextResponse.json({ error: "تلاش‌های زیادی انجام شده است؛ چند دقیقه‌ی دیگر دوباره امتحان کنید." }, { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } });
  const hash = process.env.ADMIN_PASSWORD_HASH;
  const configuredEmail = process.env.ADMIN_EMAIL?.toLowerCase();
  const passwordMatches = hash ? await bcrypt.compare(body.password, hash).catch(() => false) : false;
  if (!configuredEmail || !passwordMatches || body.email.toLowerCase() !== configuredEmail) {
    return NextResponse.json({ error: "ایمیل یا رمز عبور نادرست است." }, { status: 401 });
  }
  try {
    const configuredSecret = process.env.ADMIN_TOTP_SECRET;
    if (!configuredSecret || !permissionsFor(process.env.ADMIN_ROLE).length) throw new Error("Admin configuration incomplete");
    const secret = decodeTotpSecret(configuredSecret);
    const code = body.mfaCode ?? "";
    const step = matchTotp(secret, code);
    const recoveryHash = digest(code);
    const recoveryAllowed = /^[a-f0-9]{32}$/.test(code) &&
      (process.env.ADMIN_RECOVERY_CODE_HASHES ?? "").split(",").map(hash => hash.trim()).includes(recoveryHash);
    const proof = step !== null
      ? { hash: digest("totp:" + secret.toString("hex") + ":" + step), expiresAt: new Date((step + 2) * 30_000) }
      : recoveryAllowed ? { hash: recoveryHash, expiresAt: null } : null;
    if (!proof || !await createAdminSession(configuredEmail, proof)) {
      return NextResponse.json({ error: "کد تأیید نامعتبر یا قبلاً استفاده شده است." }, { status: 401 });
    }
    await clearRateLimit("admin-login", request).catch(() => {});
    return NextResponse.json({ ok: true });
  }
  catch { return NextResponse.json({ error: "ورود مدیر پیکربندی نشده است." }, { status: 503 }); }
}
