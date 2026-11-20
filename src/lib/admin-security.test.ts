import test from "node:test";
import assert from "node:assert/strict";
import { decodeTotpSecret, matchTotp, totpAt } from "./admin-mfa.ts";
import { permissionsFor } from "./admin-permissions.ts";

test("TOTP matches the six-digit suffix of the RFC 6238 SHA-1 vector", () => {
  const seed = decodeTotpSecret("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
  assert.equal(totpAt(seed, 1), "287082");
  assert.equal(matchTotp(seed, "287082", 59_000), 1);
  assert.equal(matchTotp(seed, "287082", 120_000), null);
  assert.equal(matchTotp(seed, "not-a-code", 59_000), null);
  assert.throws(() => decodeTotpSecret("bad"));
});

test("roles only receive their own panel permissions", () => {
  assert.equal(permissionsFor("owner").length, 6);
  assert.deepEqual(permissionsFor("support"), ["orders:read", "orders:write"]);
  assert.deepEqual(permissionsFor("catalog"), ["catalog:read", "catalog:write", "media:write"]);
  assert.deepEqual(permissionsFor("auditor"), ["audit:read"]);
  assert.deepEqual(permissionsFor("unknown"), []);
});
