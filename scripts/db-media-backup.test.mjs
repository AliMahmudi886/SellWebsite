import assert from "node:assert/strict";
import { copyFile, cp, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import sharp from "sharp";
import { restoreReferencedMedia, snapshotReferencedMedia, verifyBackupBundle } from "./db-media-backup.mjs";

const filename = "c4ba81ac-41f9-430b-bb35-7f17c50d0e1b.webp";

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(),"narenj-media-test-"));
  t.after(() => rm(root,{recursive:true,force:true}));
  const source = join(root,"source");
  await mkdir(source);
  const original = await sharp({create:{width:4,height:4,channels:3,background:"#78543c"}}).webp().toBuffer();
  await writeFile(join(source,filename),original);
  const dump = join(root,"test.dump");
  await writeFile(dump,"fixture database archive");
  return {root,source,original,dump,snapshot:dump+".media",restored:join(root,"restored")};
}

test("restores real WebP bytes once for duplicate product references", async t => {
  const {source,original,dump,snapshot,restored} = await fixture(t);
  await snapshotReferencedMedia(source,snapshot,[filename,filename],dump);
  assert.deepEqual(await restoreReferencedMedia(snapshot,restored,[filename],dump),{files:1,bytes:original.length});
  assert.deepEqual(await readFile(join(restored,filename)),original);
});

test("rejects missing files and unsafe product references", async t => {
  const {source,dump,snapshot} = await fixture(t);
  await assert.rejects(snapshotReferencedMedia(source,snapshot,["../"+filename],dump), /Invalid upload filename/);
  await assert.rejects(snapshotReferencedMedia(source,snapshot,["4f8d96e5-3005-4691-8011-230f701fc7ee.webp"],dump), {code:"ENOENT"});
});

test("rejects a mismatched dump and content that no longer matches the manifest", async t => {
  const {source,original,dump,snapshot,restored} = await fixture(t);
  await snapshotReferencedMedia(source,snapshot,[filename],dump);
  await assert.rejects(restoreReferencedMedia(snapshot,restored,[filename],"other.dump"), /mismatched/);
  const corrupted = Buffer.from(original);
  corrupted[corrupted.length - 1] ^= 1;
  await writeFile(join(snapshot,filename),corrupted);
  await assert.rejects(restoreReferencedMedia(snapshot,restored,[filename],dump), /checksum mismatch/);
});

test("verifies a copied bundle offline and rejects same-name dump corruption", async t => {
  const {root,source,dump,snapshot,original} = await fixture(t);
  await snapshotReferencedMedia(source,snapshot,[filename],dump);
  const target = join(root,"copied");
  await mkdir(target);
  const copiedDump = join(target,"test.dump");
  await copyFile(dump,copiedDump);
  await cp(snapshot,copiedDump+".media",{recursive:true});
  assert.equal((await verifyBackupBundle(copiedDump)).mediaBytes,original.length);
  const corrupted = await readFile(copiedDump);
  corrupted[0] ^= 1;
  await writeFile(copiedDump,corrupted);
  await assert.rejects(verifyBackupBundle(copiedDump), /Database dump checksum mismatch/);
});
