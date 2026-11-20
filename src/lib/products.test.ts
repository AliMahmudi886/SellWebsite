import {test} from "node:test";
import assert from "node:assert/strict";
import {normalizeSearch} from "./products.ts";

test("normalizes Persian/Arabic Yeh, Kaf and digits for product search",()=>{
 assert.equal(normalizeSearch("كالاى ۱۲۳"),normalizeSearch("کالای 123"));
 assert.equal(normalizeSearch("خانه   و دکور"),"خانه و دکور");
});
