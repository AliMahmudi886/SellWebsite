import { createHash } from "node:crypto";
import { createReadStream, constants } from "node:fs";
import { copyFile, lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const mediaName = /^[a-f0-9-]{36}\.webp$/;

function requireMediaName(name) {
  if (typeof name !== "string" || !mediaName.test(name)) throw new Error("Invalid upload filename.");
  return name;
}

async function measure(path) {
  const stat = await lstat(path);
  if (!stat.isFile()) throw new Error("Expected a regular upload file.");
  const hash = createHash("sha256");
  let bytes = 0;
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk);
    bytes += chunk.length;
  }
  return { bytes, sha256:hash.digest("hex") };
}

export async function snapshotReferencedMedia(source, snapshot, references, databaseDump) {
  const names = [...new Set(references.map(requireMediaName))].sort();
  await mkdir(snapshot);
  const files = [];
  for (const name of names) {
    const from = join(source, name);
    if (!(await lstat(from)).isFile()) throw new Error("Referenced media is not a regular file: " + name);
    const to = join(snapshot, name);
    await copyFile(from, to, constants.COPYFILE_EXCL);
    files.push({name, ...await measure(to)});
  }
  await writeFile(join(snapshot,"manifest.json"), JSON.stringify({version:1,databaseDump,files},null,2), {flag:"wx",mode:0o600});
}

export async function restoreReferencedMedia(snapshot, destination, references, databaseDump) {
  const manifest = JSON.parse(await readFile(join(snapshot,"manifest.json"),"utf8"));
  if (manifest.version !== 1 || manifest.databaseDump !== databaseDump || !Array.isArray(manifest.files)) {
    throw new Error("Invalid or mismatched media manifest.");
  }
  const expected = new Set(references.map(requireMediaName));
  if (manifest.files.length !== expected.size) throw new Error("Media manifest does not match restored database.");
  await mkdir(destination);
  let bytes = 0;
  for (const { name, sha256, bytes: expectedBytes } of manifest.files) {
    requireMediaName(name);
    if (!expected.delete(name)) throw new Error("Unexpected or duplicate upload in media manifest.");
    const source = join(snapshot,name);
    const saved = await measure(source);
    if (saved.bytes !== expectedBytes || saved.sha256 !== sha256) throw new Error("Media backup checksum mismatch: " + name);
    const target = join(destination,name);
    await copyFile(source,target,constants.COPYFILE_EXCL);
    const restored = await measure(target);
    if (restored.bytes !== expectedBytes || restored.sha256 !== sha256) throw new Error("Restored media checksum mismatch: " + name);
    bytes += restored.bytes;
  }
  return { files:manifest.files.length, bytes };
}
