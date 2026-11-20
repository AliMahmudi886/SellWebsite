import { spawnSync } from "node:child_process";
import { statSync, realpathSync, readFileSync } from "node:fs";

function integerEnv(name, fallback, min, max) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error("Invalid " + name);
  return value;
}

const rows = integerEnv("WAL_DRILL_TRANSACTIONS_PER_CLIENT",1000,1,1000000);
const baseRows = integerEnv("WAL_DRILL_BASE_TRANSACTIONS_PER_CLIENT",0,0,1000000);
const timeoutMs = integerEnv("WAL_DRILL_TIMEOUT_SECONDS",120,30,7200)*1000;
const destination = process.env.WAL_DRILL_DESTINATION;
const mount = [];
if (destination) {
  const path = realpathSync(destination);
  if (/[,"\r\n]/.test(path) || !statSync(path).isDirectory()) throw new Error("Invalid WAL_DRILL_DESTINATION directory");
  mount.push("--mount","type=bind,source="+path+",target=/drill-destination");
}
const readScript = name => readFileSync(new URL(name,import.meta.url),"utf8").replace(/\r\n/g,"\n");
const script = [
  "set -eu",
  "export WAL_DRILL_TRANSACTIONS_PER_CLIENT=" + rows,
  "export WAL_DRILL_BASE_TRANSACTIONS_PER_CLIENT=" + baseRows,
  "export WAL_DRILL_OFFSITE_ROOT=" + (destination ? "/drill-destination" : "/tmp"),
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
  "export WAL_DESTINATION_HELPER=$(mktemp)",
  "cat > \"$WAL_DESTINATION_HELPER\" <<'NARENJ_WAL_DESTINATION'",
  readScript("./db-wal-destination-health.sh"),
  "NARENJ_WAL_DESTINATION",
  readScript("./db-pitr-drill.sh"),
].join("\n");
const result = spawnSync("docker",[
  "run","--rm","-i","--network","none","--pull","never","--user","postgres",
  ...mount,"--entrypoint","sh","postgres:16-alpine","-s",
],{input:script,encoding:"utf8",timeout:timeoutMs});
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
