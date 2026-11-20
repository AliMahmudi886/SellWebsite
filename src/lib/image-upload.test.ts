import { test } from "node:test";
import assert from "node:assert/strict";
import { detectImageMime } from "./image-upload.ts";
test("detects JPEG, PNG and WebP signatures",()=>{
  assert.equal(detectImageMime(Buffer.from("ffd8ff0000","hex")),"image/jpeg");
  assert.equal(detectImageMime(Buffer.from("89504e470d0a1a0a0000","hex")),"image/png");
  assert.equal(detectImageMime(Buffer.from("524946460000000057454250","hex")),"image/webp");
});
test("rejects spoofed image MIME payloads",()=>{
  assert.equal(detectImageMime(Buffer.from("<svg onload=alert(1) />")),null);
  assert.equal(detectImageMime(Buffer.from("GIF89a","ascii")),null);
  assert.equal(detectImageMime(new Uint8Array([1,2])),null);
});
