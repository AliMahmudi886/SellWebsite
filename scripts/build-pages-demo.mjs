import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";

import { join, relative, resolve, sep } from "node:path";

const basePath = "/SellWebsite";
const siteUrl = "https://alimahmudi886.github.io" + basePath;
if (!process.argv[2]) throw new Error("Pass an empty output directory.");
const output = resolve(process.argv[2]);
await mkdir(output, { recursive: true });
if ((await readdir(output)).length) throw new Error("The output directory must be empty.");

const root = process.cwd();
const stage = await mkdtemp(join(root, ".narenj-next-export-"));
const privateRoutes = new Set(["src/app/admin", "src/app/api"]);
try {
  await cp("src", join(stage, "src"), {
    recursive: true,
    filter: path => !privateRoutes.has(relative(root, path).split(sep).join("/")),
  });
  for (const directory of ["assets", "fonts", "icons", "images"]) {
    await cp(join("public", directory), join(stage, "public", directory), { recursive: true });
  }
  for (const file of ["package.json", "tsconfig.json"]) await cp(file, join(stage, file));
  await symlink(join(root, "node_modules"), join(stage, "node_modules"), process.platform === "win32" ? "junction" : "dir");
  await writeFile(join(stage, "next.config.mjs"), "export default " + JSON.stringify({
    output: "export", basePath, trailingSlash: true, images: { unoptimized: true }, experimental: { cpus: 2 },
  }));
  for (const route of ["page.tsx", "product/[id]/page.tsx"]) {
    const path = join(stage, "src/app", route);
    const source = await readFile(path, "utf8");
    await writeFile(path, source.replace(/export const dynamic\s*=\s*"force-dynamic";/, 'export const dynamic = "force-static";'));
  }
  for (const route of ["sitemap.ts", "robots.ts"]) {
    const path = join(stage, "src/app", route);
    await writeFile(path, (await readFile(path, "utf8")) + '\nexport const dynamic = "force-static";\n');
  }
  for (const file of await readdir(join(stage, "src"), { recursive: true })) {
    if (!/\.tsx?$/.test(file)) continue;
    const path = join(stage, "src", file);
    const source = await readFile(path, "utf8");
    const demoSource = file.split(sep).join("/") === "lib/products.ts"
      ? source.replace(/id: "([a-z-]+)"([^\n]*?)image: "\/images\/narenj-products\.webp"/g, 'id: "$1"$2image: "/assets/catalog/$1.webp"')
      : source;
    const rewritten = demoSource.replace(/(["'\x60(])\/(assets|fonts|icons|images)\//g, "$1" + basePath + "/$2/");
    if (source !== rewritten) await writeFile(path, rewritten);
  }

  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith("NEXT_PUBLIC_")));
  Object.assign(env, { NEXT_PUBLIC_NARENJ_DEMO: "true", NEXT_PUBLIC_SITE_URL: siteUrl, NEXT_TELEMETRY_DISABLED: "1" });
  const result = spawnSync(process.execPath, [join(root, "node_modules/next/dist/bin/next"), "build", "--webpack"], {
    cwd: stage, env, stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error("Next.js static export failed.");
  await cp(join(stage, "out"), output, { recursive: true });
  for (const file of await readdir(join(output, "_next"), { recursive: true })) {
    if (!file.endsWith(".css")) continue;
    const path = join(output, "_next", file);
    const css = await readFile(path, "utf8");
    await writeFile(path, css.replace(/url\((["\x27]?)\/(icons|images)\//g, "url($1" + basePath + "/$2/"));
  }
  await writeFile(join(output, ".nojekyll"), "");
} finally {
  await rm(stage, { recursive: true, force: true });
}
