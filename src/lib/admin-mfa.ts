import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function decodeTotpSecret(secret: string): Buffer {
  const normalized = secret.trim().toUpperCase().replace(/=+$/, "");
  if (!/^[A-Z2-7]{32,128}$/.test(normalized)) throw new Error("Invalid TOTP secret");
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0, value = 0;
  const bytes: number[] = [];
  for (const digit of normalized) {
    value = (value << 5) | alphabet.indexOf(digit);
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((value >>> bits) & 255);
    }
  }
  return Buffer.from(bytes);
}

export function totpAt(secret: Buffer, step: number) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const mac = createHmac("sha1", secret).update(counter).digest();
  const offset = mac[mac.length - 1] & 15;
  return String((mac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

export function matchTotp(secret: Buffer, code: string, now = Date.now()) {
  if (!/^\d{6}$/.test(code)) return null;
  const step = Math.floor(now / 30_000);
  for (const candidate of [step, step - 1, step + 1]) {
    if (candidate >= 0 && timingSafeEqual(Buffer.from(totpAt(secret, candidate)), Buffer.from(code))) return candidate;
  }
  return null;
}
