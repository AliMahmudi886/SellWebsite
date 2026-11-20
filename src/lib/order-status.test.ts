import {test} from "node:test";
import assert from "node:assert/strict";
import {canTransitionOrderStatus} from "./order-status.ts";

test("allows only forward fulfillment transitions and cancellation before dispatch",()=>{
 assert.equal(canTransitionOrderStatus("awaiting_contact","confirmed"),true);
 assert.equal(canTransitionOrderStatus("preparing","sent"),true);
 assert.equal(canTransitionOrderStatus("sent","delivered"),true);
 assert.equal(canTransitionOrderStatus("confirmed","cancelled"),true);
 assert.equal(canTransitionOrderStatus("awaiting_contact","delivered"),false);
 assert.equal(canTransitionOrderStatus("sent","cancelled"),false);
 assert.equal(canTransitionOrderStatus("delivered","cancelled"),false);
 assert.equal(canTransitionOrderStatus("cancelled","confirmed"),false);
 assert.equal(canTransitionOrderStatus("invalid","sent"),false);
});
