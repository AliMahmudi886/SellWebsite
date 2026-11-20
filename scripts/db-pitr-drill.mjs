import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const script = readFileSync(new URL("./db-pitr-drill.sh",import.meta.url),"utf8").replace(/\r\n/g,"\n");
const result = spawnSync("docker",[
  "run","--rm","-i","--network","none","--pull","never","--user","postgres",
  "--entrypoint","sh","postgres:16-alpine","-s",
],{input:script,encoding:"utf8",timeout:120_000});
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
