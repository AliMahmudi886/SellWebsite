import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { createSmokeAdminSession } from "./smoke-admin-session.mjs";
import { dispatchNextOrderEvent } from "./order-outbox-dispatch.mjs";
import bcrypt from "bcryptjs";
import pg from "pg";
import { decodeTotpSecret, digest, totpAt } from "../src/lib/admin-mfa.ts";

const db = new URL(process.env.DATABASE_URL);
if (process.env.NODE_ENV === "production" || !["localhost","127.0.0.1"].includes(db.hostname)) throw new Error("Local test database required");
const schema = "admin_security_" + randomBytes(8).toString("hex");
const root = new pg.Pool({ connectionString: db.href });
db.searchParams.set("options", "-c search_path=" + schema);
const isolated = new pg.Pool({ connectionString: db.href });
const base = "http://localhost:3112";
const email = "security-test@example.invalid";
const password = randomBytes(24).toString("hex");
const recovery = randomBytes(16).toString("hex");
const browserRecovery = randomBytes(16).toString("hex");
const secret = Array.from(randomBytes(32), v => "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"[v & 31]).join("");
let server;
const env = {
  ...process.env, DATABASE_URL: db.href, ADMIN_EMAIL: email,
  ADMIN_PASSWORD_HASH: (await bcrypt.hash(password, 4)).replaceAll("$", "\\$"),
  ADMIN_TOTP_SECRET: secret, ADMIN_RECOVERY_CODE_HASHES: [recovery, browserRecovery].map(digest).join(","),
  NEXT_PUBLIC_SITE_URL: base, TRUST_PROXY: "false",
};
const request = (path, init) => fetch(base + path, { ...init, signal: AbortSignal.timeout(3000) });
async function stopServer() {
  if (server && server.exitCode === null && server.signalCode === null) {
    const stopped = once(server, "exit");
    server.kill();
    await stopped;
  }
}
async function startServer(role) {
  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "localhost", "--port", "3112"], {
    env: { ...env, ADMIN_ROLE: role }, stdio: "ignore",
  });
  for (let i = 0; i < 40; i++) {
    if (server.exitCode !== null) throw new Error("Test server exited");
    try { if ((await request("/api/admin/session")).ok) return; } catch {}
    await delay(250);
  }
  throw new Error("Test server did not start");
}
async function runScript(name) {
  const child = spawn(process.execPath, ["--experimental-strip-types", "scripts/" + name + ".mjs"], {
    env: { ...env, ADMIN_ROLE: "owner" }, stdio: "inherit",
  });
  const [code] = await once(child, "exit");
  assert.equal(code, 0, name + " failed");
}
try {
  await root.query("CREATE SCHEMA " + schema);
  for (const name of (await readdir("db/migrations")).filter(name => /^\d+.*\.sql$/.test(name)).sort()) {
    await isolated.query(await readFile("db/migrations/" + name, "utf8"));
  }
  await isolated.query("INSERT INTO categories(name) VALUES ('خانه و پارچه'),('سرامیک'),('رایحه و آرامش'),('خانه و دکور') ON CONFLICT DO NOTHING");
  await runScript("seed");
  await startServer("auditor");

  const login = (mfaCode, candidate = password) => request("/api/admin/login", { method: "POST", headers: { origin: base, "content-type": "application/json" }, body: JSON.stringify({ email, password: candidate, mfaCode }) });
  const session = cookie => request("/api/admin/session", { headers: { cookie } }).then(r => r.json());
  const read = (path, cookie) => request(path, { headers: { cookie } });
  assert.equal((await read("/api/admin/audit", "")).status, 401);
  assert.equal((await login(recovery, "incorrect")).status, 401);
  assert.equal((await login()).status, 401);
  const code = totpAt(decodeTotpSecret(secret), Math.floor(Date.now() / 30_000));
  const signedIn = await login(code);
  assert.equal(signedIn.status, 200, signedIn.ok ? undefined : (await signedIn.json()).error);
  const setCookie = signedIn.headers.get("set-cookie");
  for (const attr of [/HttpOnly/i, /Secure/i, /SameSite=strict/i]) assert.match(setCookie, attr);
  const cookie = setCookie.split(";")[0];
  const token = cookie.split("=")[1];
  assert.deepEqual((await session(cookie)).permissions, ["audit:read"]);
  assert.equal((await read("/api/admin/audit", cookie)).status, 200);
  for (const path of ["/api/admin/categories","/api/admin/products","/api/orders"]) assert.equal((await read(path, cookie)).status, 401);
  assert.equal((await login(code)).status, 401);
  assert.equal((await isolated.query("SELECT token_hash FROM admin_sessions")).rows[0].token_hash, digest(token));
  assert.equal((await request("/api/admin/logout", { method: "POST", headers: { origin: base, cookie } })).status, 200);
  assert.equal((await session(cookie)).authenticated, false);
  const recovered = await login(recovery);
  assert.equal(recovered.status, 200);
  const second = recovered.headers.get("set-cookie").split(";")[0];
  assert.equal((await login(recovery)).status, 401);
  await isolated.query("UPDATE admin_sessions SET expires_at=now()");
  assert.equal((await session(second)).authenticated, false);
  console.log("Admin security smoke passed: password and MFA, TOTP/recovery replay rejection, cookie flags, RBAC, logout revocation and expiry.");
  if (process.env.SECURITY_PLAYWRIGHT_MODULE) {
    const { chromium } = await import(pathToFileURL(process.env.SECURITY_PLAYWRIGHT_MODULE).href);
    const browser = await chromium.launch({ channel: "chrome", headless: true });
    try {
      const page = await browser.newPage();
      await page.goto(base + "/admin");
      await page.getByLabel("ایمیل", { exact: true }).fill(email);
      await page.getByLabel("رمز عبور", { exact: true }).fill(password);
      await page.getByLabel("کد تأیید یا بازیابی", { exact: true }).fill(browserRecovery);
      await page.getByRole("button", { name: "ورود به پنل" }).click();
      await page.getByRole("button", { name: "گزارش فعالیت مدیر" }).waitFor();
      assert.equal(await page.getByRole("button", { name: /^سفارش‌ها/ }).count(), 0);
      await page.reload();
      await page.getByRole("button", { name: "خروج", exact: true }).click();
      await page.getByRole("heading", { name: "ورود مدیر" }).waitFor();
      console.log("Playwright admin smoke passed: MFA form, auditor navigation, reload and logout.");
    } finally {
      await browser.close();
    }
  }
  await stopServer();
  await startServer("owner");
  const previousEmail = process.env.ADMIN_EMAIL;
  process.env.ADMIN_EMAIL = email;
  let ownerToken;
  try { ownerToken = await createSmokeAdminSession(isolated); }
  finally {
    if (previousEmail === undefined) delete process.env.ADMIN_EMAIL;
    else process.env.ADMIN_EMAIL = previousEmail;
  }
  const headers = { cookie: "narenj_admin_session=" + ownerToken, origin: base, "content-type": "application/json" };
  // Force an audit insert to fail only in the disposable schema.
  await isolated.query("ALTER TABLE admin_audit_log ADD CONSTRAINT smoke_reject_audit CHECK (action NOT IN ('category.created','product.created'))");
  try {
    const name = "smoke rollback fixture";
    const category = await request("/api/admin/categories", { method:"POST", headers, body:JSON.stringify({name}) });
    assert.equal(category.status, 500);
    assert.equal((await isolated.query("SELECT 1 FROM categories WHERE name=$1", [name])).rowCount, 0);
    const { rows } = await isolated.query("SELECT category FROM products WHERE id='woven-basket'");
    const payload = { name, category: rows[0].category, price:100, image:"/images/narenj-products.webp", tone:"#eeeeee", description:"temporary transaction fixture", stock:1, featured:false };
    const product = await request("/api/admin/products", { method:"POST", headers, body:JSON.stringify(payload) });
    assert.equal(product.status, 500);
    assert.equal((await isolated.query("SELECT 1 FROM products WHERE name=$1", [name])).rowCount, 0);
  } finally {
    await isolated.query("ALTER TABLE admin_audit_log DROP CONSTRAINT smoke_reject_audit");
  }
  console.log("Audit transaction smoke passed: category and product writes rolled back on audit failure.");
  const stock = async () => (await isolated.query("SELECT stock FROM products WHERE id='woven-basket'")).rows[0].stock;
  const fixture = {
    customerName:"outbox rollback fixture", phone:"09120000000",
    address:"temporary integration test address", paymentMethod:"manual",
    items:[{ id:"woven-basket", quantity:1 }],
  };
  const checkout = () => request("/api/orders", {
    method:"POST", headers:{origin:base,"content-type":"application/json","Idempotency-Key":randomUUID()},
    body:JSON.stringify(fixture),
  });
  const originalStock = await stock();
  await isolated.query("ALTER TABLE order_outbox ADD CONSTRAINT smoke_reject_outbox CHECK (false) NOT VALID");
  try {
    assert.equal((await checkout()).status, 500);
    assert.equal(await stock(), originalStock);
    assert.equal((await isolated.query("SELECT 1 FROM orders WHERE customer_name=$1",[fixture.customerName])).rowCount, 0);
  } finally {
    await isolated.query("ALTER TABLE order_outbox DROP CONSTRAINT smoke_reject_outbox");
  }
  const created = await checkout();
  assert.equal(created.status, 201);
  const { orderId } = await created.json();
  const cancel = () => request("/api/orders", {
    method:"PATCH", headers, body:JSON.stringify({ id:orderId, status:"cancelled" }),
  });
  await isolated.query("ALTER TABLE order_outbox ADD CONSTRAINT smoke_reject_outbox CHECK (false) NOT VALID");
  try {
    assert.equal((await cancel()).status, 500);
    assert.equal(await stock(), originalStock - 1);
    assert.equal((await isolated.query("SELECT status FROM orders WHERE id=$1",[orderId])).rows[0].status, "awaiting_contact");
    assert.equal((await isolated.query("SELECT 1 FROM order_events WHERE order_id=$1 AND status='cancelled'",[orderId])).rowCount, 0);
    assert.equal((await isolated.query("SELECT 1 FROM admin_audit_log WHERE target_id=$1",[orderId])).rowCount, 0);
  } finally {
    await isolated.query("ALTER TABLE order_outbox DROP CONSTRAINT smoke_reject_outbox");
  }
  assert.equal((await cancel()).status, 200);
  assert.equal(await stock(), originalStock);
  console.log("Outbox smoke passed: checkout and cancellation roll back on event failure, with successful retry.");
  const deliveryState = () => isolated.query(
    "SELECT id,delivery_attempts,failed_at,published_at,next_attempt_at>now() AS delayed FROM order_outbox WHERE order_id=$1 ORDER BY id",
    [orderId],
  ).then(result => result.rows);
  assert.equal((await deliveryState()).length, 2);
  await isolated.query("ALTER TABLE order_event_inbox ADD CONSTRAINT smoke_reject_delivery CHECK (false) NOT VALID");
  try {
    assert.equal(await dispatchNextOrderEvent(isolated), "retry");
    const retry = (await deliveryState()).find(row => row.delivery_attempts === 1);
    assert.ok(retry?.delayed);
    assert.equal(retry.published_at, null);
    assert.equal(retry.failed_at, null);
    await isolated.query("UPDATE order_outbox SET delivery_attempts=7 WHERE order_id=$1 AND id<>$2", [orderId,retry.id]);
    assert.equal(await dispatchNextOrderEvent(isolated), "failed");
    assert.equal(await dispatchNextOrderEvent(isolated), "empty");
    const exhausted = (await deliveryState()).find(row => row.delivery_attempts === 8);
    assert.ok(exhausted?.failed_at);
    assert.equal(exhausted.published_at, null);
    assert.equal((await isolated.query("SELECT 1 FROM order_event_inbox")).rowCount, 0);
  } finally {
    await isolated.query("ALTER TABLE order_event_inbox DROP CONSTRAINT smoke_reject_delivery");
  }

  // Make the delayed event due and explicitly requeue the exhausted fixture.
  await isolated.query("UPDATE order_outbox SET next_attempt_at=now(),failed_at=NULL WHERE order_id=$1", [orderId]);
  const workers = await Promise.all(Array.from({length:4}, () => dispatchNextOrderEvent(isolated)));
  assert.equal(workers.filter(result => result === "delivered").length, 2);
  assert.equal((await isolated.query("SELECT 1 FROM order_event_inbox")).rowCount, 2);
  assert.ok((await deliveryState()).every(row => row.published_at));
  await isolated.query("UPDATE order_outbox SET published_at=NULL WHERE id=$1", [(await deliveryState())[0].id]);
  assert.equal(await dispatchNextOrderEvent(isolated), "delivered");
  assert.equal((await isolated.query("SELECT 1 FROM order_event_inbox")).rowCount, 2);
  assert.equal(await dispatchNextOrderEvent(isolated), "empty");
  console.log("Outbox dispatch smoke passed: retry delay, exhaustion, concurrent dispatch and inbox deduplication.");
  await runScript("smoke-db");
  await runScript("smoke-upload");
  await runScript("order-outbox-worker");
} finally {
  if (server && server.exitCode === null && server.signalCode === null) {
    const stopped = once(server, "exit");
    server.kill();
    await stopped;
  }
  await isolated.end();
  try { await root.query("DROP SCHEMA IF EXISTS " + schema + " CASCADE"); } finally { await root.end(); }
}
