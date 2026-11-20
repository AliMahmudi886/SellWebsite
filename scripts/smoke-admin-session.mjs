import { createHash, randomBytes } from "node:crypto";

export const sessionHash = token => createHash("sha256").update(token).digest("hex");

export async function createSmokeAdminSession(pool) {
  const email = process.env.ADMIN_EMAIL?.toLowerCase();
  if (process.env.NODE_ENV === "production" || !email) throw new Error("Local admin configuration is required.");
  const token = randomBytes(32).toString("base64url");
  await pool.query("INSERT INTO admin_sessions(token_hash,email,expires_at) VALUES($1,$2,now()+interval '2 minutes')", [sessionHash(token), email]);
  return token;
}
