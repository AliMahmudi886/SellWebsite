import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const readScript = name => readFileSync(new URL(name,import.meta.url),"utf8").replace(/\r\n/g,"\n");
const script = [
  "set -eu",
  "export WAL_ARCHIVE_HELPER=$(mktemp)",
  "cat > \"$WAL_ARCHIVE_HELPER\" <<'NARENJ_WAL_HELPER'",
  readScript("./db-wal-archive.sh"),
  "NARENJ_WAL_HELPER",
  "export WAL_HEALTH_SQL=$(mktemp)",
  "cat > \"$WAL_HEALTH_SQL\" <<'NARENJ_WAL_HEALTH'",
  readScript("./db-wal-health.sql"),
  "NARENJ_WAL_HEALTH",
  "export WAL_FS_HELPER=$(mktemp)",
  "cat > \"$WAL_FS_HELPER\" <<'NARENJ_WAL_FS'",
  readScript("./db-wal-filesystem.sh"),
  "NARENJ_WAL_FS",
  readScript("./db-pitr-drill.sh"),
].join("\n");
const result = spawnSync("docker",[
  "run","--rm","-i","--network","none","--pull","never","--user","postgres",
  "--entrypoint","sh","postgres:16-alpine","-s",
],{input:script,encoding:"utf8",timeout:120_000});
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
