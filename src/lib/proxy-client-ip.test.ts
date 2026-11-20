import { test } from "node:test";
import assert from "node:assert/strict";
import { clientIpFromTrustedProxy,trustedProxyHops } from "./proxy-client-ip.ts";

const request=(headers:Record<string,string>)=>new Request("https://shop.example.test/",{headers});

test("defaults to one trusted proxy and validates hop configuration",()=>{
  assert.equal(trustedProxyHops(undefined),1);
  assert.equal(trustedProxyHops("2"),2);
  for(const invalid of ["0","9","1.5","-1","nope"])assert.equal(trustedProxyHops(invalid),0);
});
test("selects the client address at the configured distance from the trusted edge",()=>{
  const req=request({"x-forwarded-for":"198.51.100.10, 203.0.113.20, 192.0.2.30"});
  assert.equal(clientIpFromTrustedProxy(req,1),"192.0.2.30");
  assert.equal(clientIpFromTrustedProxy(req,2),"203.0.113.20");
  assert.equal(clientIpFromTrustedProxy(req,3),"198.51.100.10");
});
test("fails closed for invalid, oversized, or too-short forwarded chains",()=>{
  assert.equal(clientIpFromTrustedProxy(request({"x-forwarded-for":"attacker, 203.0.113.20"}),1),undefined);
  assert.equal(clientIpFromTrustedProxy(request({"x-forwarded-for":"198.51.100.10"}),2),undefined);
  assert.equal(clientIpFromTrustedProxy(request({"x-forwarded-for":"1.1.1.1".repeat(100)}),1),undefined);
  assert.equal(clientIpFromTrustedProxy(request({"x-forwarded-for":"198.51.100.10"}),0),undefined);
});
test("uses a valid X-Real-IP only when X-Forwarded-For is absent",()=>{
  assert.equal(clientIpFromTrustedProxy(request({"x-real-ip":"2001:db8::1"}),1),"2001:db8::1");
  assert.equal(clientIpFromTrustedProxy(request({"x-forwarded-for":"invalid","x-real-ip":"198.51.100.1"}),1),undefined);
  assert.equal(clientIpFromTrustedProxy(request({"x-real-ip":"not-an-ip"}),1),undefined);
});
