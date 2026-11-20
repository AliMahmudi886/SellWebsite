import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { getPool } from "@/lib/db";
import { digest } from "@/lib/admin-mfa";
import { permissionsFor, type AdminPermission } from "@/lib/admin-permissions";

const cookieName = "narenj_admin_session";
const lifetimeSeconds = 8 * 60 * 60;
const tokenPattern = /^[A-Za-z0-9_-]{43}$/;

export async function createAdminSession(email: string, proof: { hash: string; expiresAt: Date | null }) {
  const jar = await cookies();
  const previous = jar.get(cookieName)?.value;
  const token = randomBytes(32).toString("base64url");
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM admin_mfa_claims WHERE expires_at <= now()");
    const claimed = await client.query("INSERT INTO admin_mfa_claims(email,proof_hash,expires_at) VALUES($1,$2,$3) ON CONFLICT DO NOTHING", [email, proof.hash, proof.expiresAt]);
    if (!claimed.rowCount) {
      await client.query("ROLLBACK");
      return false;
    }
    await client.query("DELETE FROM admin_sessions WHERE expires_at <= now() OR token_hash = $1", [previous && tokenPattern.test(previous) ? digest(previous) : null]);
    await client.query("INSERT INTO admin_sessions(token_hash,email,expires_at) VALUES($1,$2,$3)", [digest(token), email, new Date(Date.now() + lifetimeSeconds * 1000)]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  jar.set(cookieName, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: lifetimeSeconds });
  return true;
}

export async function clearAdminSession() {
  const jar = await cookies();
  const token = jar.get(cookieName)?.value;
  if (token && tokenPattern.test(token)) {
    await getPool().query("DELETE FROM admin_sessions WHERE token_hash = $1", [digest(token)]);
  }
  jar.delete(cookieName);
}

export async function getAdmin(permission?: AdminPermission) {
  const token = (await cookies()).get(cookieName)?.value;
  const email = process.env.ADMIN_EMAIL?.toLowerCase();
  const permissions = permissionsFor(process.env.ADMIN_ROLE);
  if (!email || !token || !tokenPattern.test(token) || !permissions.length || (permission && !permissions.includes(permission))) return null;
  try {
    const result = await getPool().query("SELECT 1 FROM admin_sessions WHERE token_hash = $1 AND email = $2 AND expires_at > now()", [digest(token), email]);
    return result.rowCount ? email : null;
  } catch {
    return null;
  }
}

export function validOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try { return new URL(origin).host === new URL(request.url).host; } catch { return false; }
}
