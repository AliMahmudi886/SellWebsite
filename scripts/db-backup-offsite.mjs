import { constants } from "node:fs";
import { copyFile, lstat, mkdir, mkdtemp, readdir, realpath, rename } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, sep } from "node:path";
import { verifyBackupBundle } from "./db-media-backup.mjs";

const dumpNamePattern = /^restore-drill-(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z\.dump$/;

function bundleTimestamp(name) {
  const match = dumpNamePattern.exec(name);
  if (!match) return null;
  const [, day, hour, minute, second, ms] = match;
  const stamp = day + "T" + hour + ":" + minute + ":" + second + "." + ms + "Z";
  const time = new Date(stamp);
  return Number.isNaN(time.valueOf()) || time.toISOString() !== stamp ? null : time;
}

export async function copyOffsiteBundle(dump, destination) {
  const name = basename(dump);
  if (!bundleTimestamp(name)) throw new Error("Expected a timestamped restore drill dump.");
  const root = await realpath(destination);
  if (!(await lstat(root)).isDirectory()) throw new Error("Destination must be a directory.");
  const source = await realpath(dirname(dump));
  const relation = relative(source,root);
  if (!relation || (!isAbsolute(relation) && relation !== ".." && !relation.startsWith(".."+sep))) {
    throw new Error("Destination must be outside the source backup directory.");
  }

  const media = dump + ".media";
  const { files } = await verifyBackupBundle(dump);
  const target = join(root,name+".bundle");
  const exists = await lstat(target).then(() => true, error => {
    if (error.code === "ENOENT") return false;
    throw error;
  });
  if (exists) throw new Error("Destination bundle already exists.");

  const stage = await mkdtemp(join(root,".incomplete-"));
  const stagedDump = join(stage,name);
  const stagedMedia = stagedDump + ".media";

  await mkdir(stagedMedia,{mode:0o700});
  await copyFile(dump,stagedDump,constants.COPYFILE_EXCL);
  await copyFile(join(media,"manifest.json"),join(stagedMedia,"manifest.json"),constants.COPYFILE_EXCL);
  for (const { name: filename } of files) {
    await copyFile(join(media,filename),join(stagedMedia,filename),constants.COPYFILE_EXCL);
  }
  await verifyBackupBundle(stagedDump);
  await rename(stage,target);
  return target;
}

export async function planOffsiteRetention(destination) {
  const bundles = [];
  const ignored = [];
  for (const entry of await readdir(destination,{withFileTypes:true})) {
    const name = entry.name;
    const dump = name.endsWith(".bundle") ? name.slice(0,-7) : "";
    const timestamp = bundleTimestamp(dump);
    if (!entry.isDirectory() || !timestamp) {
      ignored.push(name);
      continue;
    }
    try {
      await verifyBackupBundle(join(destination,name,dump));
      bundles.push({ name,timestamp });
    } catch {
      ignored.push(name);
    }
  }
  bundles.sort((a,b) => b.timestamp - a.timestamp);
  const buckets = { daily:new Set(), weekly:new Set(), monthly:new Set() };
  const keep = [];
  const eligible = [];
  for (const {name,timestamp} of bundles) {
    const monday = new Date(timestamp);
    monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay()+6)%7);
    const groups = [
      [buckets.daily,timestamp.toISOString().slice(0,10),7],
      [buckets.weekly,monday.toISOString().slice(0,10),4],
      [buckets.monthly,timestamp.toISOString().slice(0,7),12],
    ];
    let selected = false;
    for (const [seen,key,limit] of groups) {
      if (!seen.has(key) && seen.size < limit) {
        seen.add(key);
        selected = true;
      }
    }
    (selected ? keep : eligible).push(name);
  }
  return { keep, eligible, ignored:ignored.sort() };
}
