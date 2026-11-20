import {test} from "node:test";
import assert from "node:assert/strict";
import {phoneToHref} from "./store-config.ts";

test("normalizes Persian and Arabic phone digits for tel links",()=>{
 assert.equal(phoneToHref("۰۲۱-۱۲۳۴۵۶۷۸"),"02112345678");
 assert.equal(phoneToHref("+٩٨٩١٢٣٤٥٦٧٨٩"),"+989123456789");
 assert.equal(phoneToHref(""),"");
});
