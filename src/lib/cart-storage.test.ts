import {test} from "node:test";
import assert from "node:assert/strict";
import {parseCartLines,reconcileCart,cartItemCount,sameCartLines} from "./cart-storage.ts";
import {products} from "./products.ts";

test("parses only positive integer cart quantities and tolerates corrupt storage",()=>{
 assert.deepEqual(parseCartLines("bad json"),[]);
 assert.deepEqual(parseCartLines(JSON.stringify([{id:"linen-cushion",quantity:2},{id:"tea-cup",quantity:0},{id:5,quantity:1}])),[{id:"linen-cushion",quantity:2}]);
});
test("reconciles stale cart against live catalog stock and merges duplicates safely",()=>{
 const result=reconcileCart([{id:"linen-cushion",quantity:8},{id:"linen-cushion",quantity:8},{id:"missing",quantity:2},{id:"tea-cup",quantity:1}],products);
 assert.deepEqual(result,[{id:"linen-cushion",quantity:12},{id:"tea-cup",quantity:1}]);
 assert.equal(cartItemCount(result),13);
});
test("compares cart snapshots by product and quantity",()=>{
 assert.equal(sameCartLines([{id:"linen-cushion",quantity:2}],[{id:"linen-cushion",quantity:2}]),true);
 assert.equal(sameCartLines([{id:"linen-cushion",quantity:2}],[{id:"linen-cushion",quantity:1}]),false);
 assert.equal(sameCartLines([{id:"linen-cushion",quantity:1}],[{id:"tea-cup",quantity:1}]),false);
});
