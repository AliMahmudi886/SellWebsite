import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import sharp from "sharp";
import { restoreReferencedMedia, snapshotReferencedMedia } from "./db-media-backup.mjs";

const filename = "c4ba81ac-41f9-430b-bb35-7f17c50d0e1b.webp";
const dump = "test.dump";

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(),"narenj-media-test-"));
  t.after(() => rm(root,{recursive:true,force:true}));
  const source = join(root,"source");
  await mkdir(source);
  const original = await sharp({create:{width:4,height:4,channels:3,background:"#78543c"}}).webp().toBuffer();
  await writeFile(join(source,filename),original);
  return {source,original,snapshot:join(root,"snapshot"),restored:join(root,"restored")};
}

test("restores real WebP bytes once for duplicate product references", async t => {
  const {source,original,snapshot,restored} = await fixture(t);
  await snapshotReferencedMedia(source,snapshot,[filename,filename],dump);
  assert.deepEqual(await restoreReferencedMedia(snapshot,restored,[filename],dump),{files:1,bytes:original.length});
  assert.deepEqual(await readFile(join(restored,filename)),original);
});

test("rejects missing files and unsafe product references", async t => {
  const {source,snapshot} = await fixture(t);
  await assert.rejects(snapshotReferencedMedia(source,snapshot,["../"+filename],dump), /Invalid upload filename/);
  await assert.rejects(snapshotReferencedMedia(source,snapshot,["4f8d96e5-3005-4691-8011-230f701fc7ee.webp"],dump), {code:"ENOENT"});
});

test("rejects a mismatched dump and content that no longer matches the manifest", async t => {
  const {source,original,snapshot,restored} = await fixture(t);
  await snapshotReferencedMedia(source,snapshot,[filename],dump);
  await assert.rejects(restoreReferencedMedia(snapshot,restored,[filename],"other.dump"), /mismatched/);
  const corrupted = Buffer.from(original);
  corrupted[corrupted.length - 1] ^= 1;
  await writeFile(join(snapshot,filename),corrupted);
  await assert.rejects(restoreReferencedMedia(snapshot,restored,[filename],dump), /checksum mismatch/);
});
