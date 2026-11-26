// Production build: minifies first-party JS/CSS into dist/ with the exact same file layout.
// The source tree keeps working unminified (GitHub Pages, local file serving); dist/ is what a
// build-aware host (Vercel) serves. Classic scripts share one global scope, so nothing is bundled
// or wrapped: each file is minified on its own and top-level names are never renamed.
import { transform } from "esbuild";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");

// Development-only material that must never be served.
const EXCLUDED = new Set([
  ".git", ".github", ".gitignore", ".vercelignore", "docs", "infra", "scripts", "tests",
  "supabase", "node_modules", "dist", "package.json", "package-lock.json", "vercel.json", "README.md",
]);
// Already minified or third-party: copied byte for byte.
const COPY_AS_IS = new Set(["js/supabase-sdk.js", "vendor/livekit/livekit-client-2.23.0.umd.js"]);

const report = [];

async function walk(dir, rel = "") {
  const out = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const relPath = rel ? `${rel}/${entry.name}` : entry.name;
    if (!rel && EXCLUDED.has(entry.name)) continue;
    if (entry.name.endsWith(".sql") || entry.name === "README.md") continue;
    if (entry.isDirectory()) out.push(...await walk(path.join(dir, entry.name), relPath));
    else out.push(relPath);
  }
  return out;
}

async function build() {
  await fs.rm(dist, { recursive: true, force: true });
  for (const rel of await walk(root)) {
    const source = await fs.readFile(path.join(root, rel));
    let output = source;
    const loader = rel.endsWith(".js") ? "js" : rel.endsWith(".css") ? "css" : null;
    if (loader && !COPY_AS_IS.has(rel)) {
      // No format/bundle option: esbuild treats the file as a classic script and keeps top-level names.
      const result = await transform(source.toString("utf8"), {
        loader, minify: true, legalComments: "none", charset: "utf8", sourcemap: false,
      });
      output = Buffer.from(result.code, "utf8");
      report.push({ rel, before: source.length, after: output.length });
    }
    const target = path.join(dist, rel);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, output);
  }
  const before = report.reduce((n, r) => n + r.before, 0);
  const after = report.reduce((n, r) => n + r.after, 0);
  for (const r of report.sort((a, b) => b.before - a.before)) {
    console.log(`${r.rel.padEnd(36)} ${(r.before / 1024).toFixed(0).padStart(5)} KB -> ${(r.after / 1024).toFixed(0).padStart(5)} KB  (-${Math.round((1 - r.after / r.before) * 100)}%)`);
  }
  console.log(`Minified ${report.length} files: ${(before / 1024).toFixed(0)} KB -> ${(after / 1024).toFixed(0)} KB (-${Math.round((1 - after / before) * 100)}%)`);
}

build().catch(error => { console.error(error); process.exit(1); });
