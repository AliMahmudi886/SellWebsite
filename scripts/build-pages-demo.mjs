import { copyFile, cp, mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { products } from "../src/lib/products.ts";

const output = process.argv[2] && resolve(process.argv[2]);
if (!output) throw new Error("Pass an empty output directory.");
await mkdir(join(output,"assets"), { recursive:true });
for (const file of ["index.html","style.css","shop.js"]) await copyFile(join("demo",file),join(output,file));
await cp("public/assets/catalog",join(output,"assets/catalog"),{recursive:true});
for (const [from,to] of [
  ["public/assets/narenj-hero.webp","hero.webp"],
  ["public/assets/narenj-hero-mobile.f7e5ba36a044.avif","hero-mobile.avif"],
  ["public/fonts/Vazirmatn-wght.woff2","vazirmatn.woff2"],
  ["public/fonts/OFL.txt","OFL.txt"],
]) await copyFile(from,join(output,"assets",to));
await writeFile(join(output,"catalog.js"),"export default "+JSON.stringify(products.filter(p=>p.published!==false))+";\n");
await writeFile(join(output,".nojekyll"),"");
