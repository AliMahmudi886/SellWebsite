import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateOrder } from "./order-rules.ts";

test("calculates total from trusted catalog prices", () => {
  assert.deepEqual(calculateOrder([{ id: "linen-cushion", quantity: 2 }]), { ok: true, total: 1780000 });
});
test("rejects unknown products and quantities over stock", () => {
  assert.deepEqual(calculateOrder([{ id: "nope", quantity: 1 }]), { ok: false, reason: "unavailable" });
  assert.deepEqual(calculateOrder([{ id: "linen-cushion", quantity: 13 }]), { ok: false, reason: "unavailable" });
});
test("rejects invalid quantities", () => {
  assert.deepEqual(calculateOrder([{ id: "linen-cushion", quantity: 0 }]), { ok: false, reason: "unavailable" });
  assert.deepEqual(calculateOrder([{ id: "linen-cushion", quantity: 1.5 }]), { ok: false, reason: "unavailable" });
});
