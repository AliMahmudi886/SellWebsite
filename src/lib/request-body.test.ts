import assert from "node:assert/strict";
import test from "node:test";
import { readBoundedText, RequestBodyTooLarge } from "./request-body.ts";

test("counts UTF-8 bytes across stream chunks and accepts the exact limit", async () => {
  const data = new TextEncoder().encode("الف");
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(data.subarray(0, 1));
      controller.enqueue(data.subarray(1));
      controller.close();
    },
  });
  assert.equal(await readBoundedText(new Response(stream), data.length), "الف");
});

test("cancels an over-limit body even without Content-Length", async () => {
  let cancelled = false;
  const stream = new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(5)); },
    cancel() { cancelled = true; },
  });
  await assert.rejects(readBoundedText(new Response(stream), 4), RequestBodyTooLarge);
  assert.equal(cancelled, true);
});

test("rejects an oversized declared length before consuming the body", async () => {
  const request = new Request("http://localhost", {
    method: "POST", headers: { "content-length": "5" }, body: "test",
  });
  await assert.rejects(readBoundedText(request, 4), RequestBodyTooLarge);
  assert.equal(request.bodyUsed, false);
});
