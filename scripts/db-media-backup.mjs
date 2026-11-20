import { createHash } from "node:crypto";
import { createReadStream, constants } from "node:fs";
import { copyFile, lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

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
  const dump = { name:basename(databaseDump), ...await measure(databaseDump) };
  await mkdir(snapshot);
  const files = [];
  for (const name of names) {
    const from = join(source, name);
    if (!(await lstat(from)).isFile()) throw new Error("Referenced media is not a regular file: " + name);
    const to = join(snapshot, name);
    await copyFile(from, to, constants.COPYFILE_EXCL);
    files.push({name, ...await measure(to)});
  }
  await writeFile(join(snapshot,"manifest.json"), JSON.stringify({version:2,databaseDump:dump,files},null,2), {flag:"wx",mode:0o600});
}

export async function verifyBackupBundle(databaseDump, snapshot = databaseDump + ".media", references) {
  if (!(await lstat(snapshot)).isDirectory()) throw new Error("Expected a media snapshot directory.");
  const manifest = JSON.parse(await readFile(join(snapshot,"manifest.json"),"utf8"));
  if (manifest.version !== 2 || manifest.databaseDump?.name !== basename(databaseDump) || !Array.isArray(manifest.files)) {
    throw new Error("Invalid or mismatched backup manifest. Version 2 is required.");
  }
  const actualDump = await measure(databaseDump);
  if (actualDump.bytes !== manifest.databaseDump.bytes || actualDump.sha256 !== manifest.databaseDump.sha256) {
    throw new Error("Database dump checksum mismatch.");
  }
  const expected = references && new Set(references.map(requireMediaName));
  if (expected && manifest.files.length !== expected.size) throw new Error("Media manifest does not match restored database.");
  const seen = new Set();
  let mediaBytes = 0;
  for (const { name, sha256, bytes } of manifest.files) {
    requireMediaName(name);
    if (seen.has(name) || (expected && !expected.has(name))) throw new Error("Unexpected or duplicate upload in media manifest.");
    seen.add(name);
    const saved = await measure(join(snapshot,name));
    if (saved.bytes !== bytes || saved.sha256 !== sha256) throw new Error("Media backup checksum mismatch: " + name);
    mediaBytes += saved.bytes;
  }
  return { files:manifest.files, mediaBytes, dumpBytes:actualDump.bytes };
}

export async function restoreReferencedMedia(snapshot, destination, references, databaseDump) {
  const { files, mediaBytes } = await verifyBackupBundle(databaseDump,snapshot,references);
  await mkdir(destination);
  for (const { name, sha256, bytes } of files) {
    const target = join(destination,name);
    await copyFile(join(snapshot,name),target,constants.COPYFILE_EXCL);
    const restored = await measure(target);
    if (restored.bytes !== bytes || restored.sha256 !== sha256) throw new Error("Restored media checksum mismatch: " + name);
  }
  return { files:files.length, bytes:mediaBytes };
}
