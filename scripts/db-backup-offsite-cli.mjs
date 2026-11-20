import { resolve } from "node:path";
import { copyOffsiteBundle, planOffsiteRetention } from "./db-backup-offsite.mjs";

const [action, first, second, ...extra] = process.argv.slice(2);
if (action === "copy" && first && second && !extra.length) {
  console.log(JSON.stringify({ verified:true, bundle:await copyOffsiteBundle(resolve(first),resolve(second)) }));
} else if (action === "plan" && first && !second) {
  console.log(JSON.stringify(await planOffsiteRetention(resolve(first)),null,2));
} else {
  throw new Error("Usage: db:backup:offsite -- copy <dump> <destination> | plan <destination>");
}
