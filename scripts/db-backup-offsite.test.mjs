import assert from "node:assert/strict";
import { mkdtemp,mkdir,rm,writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join,basename } from "node:path";
import test from "node:test";
import { snapshotReferencedMedia,verifyBackupBundle } from "./db-media-backup.mjs";
import { copyOffsiteBundle,planOffsiteRetention } from "./db-backup-offsite.mjs";

test("verified export refuses overwrite and rotation keeps protected buckets", async t => {
  const root = await mkdtemp(join(tmpdir(),"narenj-offsite-test-"));
  t.after(() => rm(root,{recursive:true,force:true}));
  const source = join(root,"source");
  const target = join(root,"target");
  await mkdir(source);
  await mkdir(target);
  const make = async date => {
    const dump = join(source,"restore-drill-"+date+"T00-00-00-000Z.dump");
    await writeFile(dump,"synthetic archive");
    await snapshotReferencedMedia(source,dump+".media",[],dump);
    return dump;
  };
  const latest = await make("2026-11-21");
  await assert.rejects(copyOffsiteBundle(latest,source), /outside/);
  const published = await copyOffsiteBundle(latest,target);
  assert.ok(await verifyBackupBundle(join(published,basename(latest))));
  await assert.rejects(copyOffsiteBundle(latest,target), /already exists/);
  for (const day of ["20","19","18","17","16","15","14","13","12","11","10","09","08","07","06","05","04","03","02","01"]) {
    await copyOffsiteBundle(await make("2026-11-"+day),target);
  }
  for (const month of ["01","02","03","04","05","06","07","08","09","10"]) {
    await copyOffsiteBundle(await make("2026-"+month+"-15"),target);
  }
  await copyOffsiteBundle(await make("2025-12-15"),target);
  await copyOffsiteBundle(await make("2025-11-15"),target);
  await mkdir(join(target,".incomplete-test"));
  const result = await planOffsiteRetention(target);
  assert.ok(result.keep.some(name => name.includes("2026-11-15")));
  assert.ok(result.keep.some(name => name.includes("2026-11-01")));
  assert.ok(result.keep.some(name => name.includes("2025-12-15")));
  assert.ok(result.eligible.some(name => name.includes("2025-11-15")));
  assert.deepEqual(result.ignored,[".incomplete-test"]);
});
