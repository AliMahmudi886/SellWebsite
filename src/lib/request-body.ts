export class RequestBodyTooLarge extends Error {}

export async function readBoundedText(request: Pick<Request, "headers" | "body">, maxBytes: number): Promise<string> {
  const declaredLength = Number(request.headers.get("content-length"));
  if (declaredLength > maxBytes) throw new RequestBodyTooLarge();
  if (!request.body) return "";

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  const parts: string[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        void reader.cancel().catch(() => {});
        throw new RequestBodyTooLarge();
      }
      parts.push(decoder.decode(value, { stream: true }));
    }
    parts.push(decoder.decode());
    return parts.join("");
  } finally {
    reader.releaseLock();
  }
}
