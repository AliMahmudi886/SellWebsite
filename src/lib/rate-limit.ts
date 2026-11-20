import { createHmac } from "node:crypto";
import { getPool, hasDatabase } from "@/lib/db";
import { clientIpFromTrustedProxy, trustedProxyHops } from "@/lib/proxy-client-ip";

type FallbackEntry = { hits: number; expiresAt: number };
type RateLimitDecision = { allowed: boolean; retryAfterSeconds: number };
const fallbackWindows = new Map<string, FallbackEntry>();

function subjectHash(request: Request) {
  const forwarded = process.env.TRUST_PROXY === "true"
    ? clientIpFromTrustedProxy(request,trustedProxyHops(process.env.TRUST_PROXY_HOPS))
    : undefined;
  const subject = forwarded || "unproxied-client";
  const key = process.env.ADMIN_SESSION_SECRET || "local-rate-limit-key";
  return createHmac("sha256", key).update(subject).digest("hex");
}

export async function consumeRateLimit(bucket: string, request: Request, limit: number, windowMs: number): Promise<RateLimitDecision> {
  const now = Date.now();
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const retryAfterSeconds = Math.max(1, Math.ceil((windowStart + windowMs - now) / 1000));
  const hashedSubject = subjectHash(request);

  if (!hasDatabase()) {
    const key = `${bucket}:${hashedSubject}:${windowStart}`;
    const entry = fallbackWindows.get(key);
    const hits = (entry?.expiresAt ?? 0) > now ? (entry?.hits ?? 0) + 1 : 1;
    fallbackWindows.set(key, { hits, expiresAt: windowStart + windowMs });
    if (fallbackWindows.size > 10_000) {
      for (const [entryKey, value] of fallbackWindows) if (value.expiresAt <= now) fallbackWindows.delete(entryKey);
    }
    return { allowed: hits <= limit, retryAfterSeconds };
  }

  const { rows } = await getPool().query(
    `INSERT INTO api_rate_limit_windows(bucket,subject_hash,window_start,hits,expires_at)
     VALUES($1,$2,$3,1,$4)
     ON CONFLICT(bucket,subject_hash,window_start)
     DO UPDATE SET hits=api_rate_limit_windows.hits+1
     RETURNING hits`,
    [bucket, hashedSubject, new Date(windowStart), new Date(windowStart + windowMs * 2)]
  );
  if (Math.random() < 0.01) void getPool().query("DELETE FROM api_rate_limit_windows WHERE expires_at < NOW()").catch(() => {});
  return { allowed: Number(rows[0]?.hits ?? 0) <= limit, retryAfterSeconds };
}

export async function clearRateLimit(bucket: string, request: Request) {
  const hashedSubject = subjectHash(request);
  if (!hasDatabase()) {
    for (const key of fallbackWindows.keys()) if (key.startsWith(`${bucket}:${hashedSubject}:`)) fallbackWindows.delete(key);
    return;
  }
  await getPool().query("DELETE FROM api_rate_limit_windows WHERE bucket=$1 AND subject_hash=$2", [bucket, hashedSubject]);
}
