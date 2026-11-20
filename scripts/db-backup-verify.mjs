import { resolve } from "node:path";
import { verifyBackupBundle } from "./db-media-backup.mjs";

const [dump, ...extra] = process.argv.slice(2);
if (!dump || extra.length || !dump.toLowerCase().endsWith(".dump")) {
  throw new Error("Usage: npm run db:backup:verify -- <path-to-dump>");
}
const result = await verifyBackupBundle(resolve(dump));
console.log(JSON.stringify({ verified:true, dump_bytes:result.dumpBytes, media_files:result.files.length, media_bytes:result.mediaBytes }));
