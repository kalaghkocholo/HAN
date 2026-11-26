// Fails the build if minification could break the app: every top-level function/variable that other
// classic scripts or inline handlers may call must survive under its original name, and every
// output file must still parse.
import { promises as fs } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const problems = [];
const skip = new Set(["supabase-sdk.js"]);

// A file whose code sits inside an IIFE keeps nothing global, so renaming its internals is safe.
// Everything else shares the page's global scope and must keep its names.
function isWrapped(source) {
  const body = source.replace(/^\s*(?:\/\*[\s\S]*?\*\/|\/\/[^\n]*\n|["']use strict["'];?|\s)+/, "");
  return body.startsWith("(");
}

const handlerNames = new Set();
const indexHtml = await fs.readFile(path.join(root, "index.html"), "utf8");
const handlerSources = [indexHtml];
const declaredGlobals = new Map(); // name -> file that declares it globally

for (const file of (await fs.readdir(path.join(root, "js"))).filter(f => f.endsWith(".js") && !skip.has(f))) {
  const source = await fs.readFile(path.join(root, "js", file), "utf8");
  const built = await fs.readFile(path.join(root, "dist", "js", file), "utf8");
  handlerSources.push(source);
  try { execFileSync(process.execPath, ["--check", path.join(root, "dist", "js", file)], { stdio: "pipe" }); }
  catch (error) { problems.push(`${file}: minified output does not parse`); continue; }
  if (isWrapped(source)) continue;
  const names = new Set();
  for (const m of source.matchAll(/^(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/gm)) names.add(m[1]);
  for (const m of source.matchAll(/^(?:const|let|var)\s+([A-Za-z_$][\w$]*)/gm)) names.add(m[1]);
  for (const name of names) {
    declaredGlobals.set(name, file);
    const escaped = name.replace(/\$/g, "\\$");
    if (!new RegExp(`(?<![\\w$.])${escaped}(?![\\w$])`).test(built)) problems.push(`${file}: global name "${name}" missing from dist`);
  }
}

// Inline handlers (onclick="doThing()") resolve through the global scope at click time.
for (const text of handlerSources) {
  for (const m of text.matchAll(/\son[a-z]+=\\?["']\s*(?:return\s+)?([A-Za-z_$][\w$]*)\s*\(/g)) handlerNames.add(m[1]);
}
const builtinHandlers = new Set(["if", "event", "this", "window", "document", "alert", "confirm", "history", "location"]);
for (const name of handlerNames) {
  if (builtinHandlers.has(name)) continue;
  const declaredHere = declaredGlobals.has(name);
  const assignedToWindow = [...handlerSources].some(t => new RegExp(`window\\.${name}\\s*=`).test(t));
  if (!declaredHere && !assignedToWindow) problems.push(`inline handler "${name}()" has no global definition`);
}
for (const file of ["index.html", "service-worker.js", "manifest.webmanifest", "styles.css", "spaces.css", "call-ui.css", "chat-viewport.css"]) {
  try { await fs.access(path.join(root, "dist", file)); } catch (_) { problems.push(`dist/${file} is missing`); }
}
for (const dev of ["scripts", "tests", "supabase", "docs", "infra", "README.md"]) {
  try { await fs.access(path.join(root, "dist", dev)); problems.push(`dist/${dev} must not be published`); } catch (_) {}
}
if (problems.length) { console.error("Build verification failed:\n- " + problems.join("\n- ")); process.exit(1); }
console.log("Build verification passed: output parses, top-level names preserved, dev files excluded.");
