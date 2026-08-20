#!/usr/bin/env node
// Walks every .html file in the repo and verifies that local (non-http)
// asset references — src="", href="" — resolve to a real file on disk.
// Catches things like a page pointing at "logo.png" when only "logo.webp"
// exists. Exits non-zero (and prints every offending reference) on failure.

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const IGNORE_DIRS = new Set(["node_modules", ".git"]);
const ATTR_RE = /\b(?:src|href)\s*=\s*"([^"]+)"/g;

// Root-relative hrefs like "/explore" aren't real files — they're routed by
// vercel.json's rewrites. Load those so the checker resolves them the same
// way Vercel would instead of flagging every clean URL as broken.
const VERCEL_CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, "vercel.json"), "utf8"));
const REWRITES = new Map((VERCEL_CONFIG.rewrites || []).map(r => [r.source, r.destination]));

function findHtmlFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORE_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      findHtmlFiles(full, out);
    } else if (entry.isFile() && entry.name.endsWith(".html")) {
      out.push(full);
    }
  }
  return out;
}

function isLocalReference(ref) {
  if (!ref) return false;
  if (/^(https?:)?\/\//i.test(ref)) return false; // absolute URL / protocol-relative
  if (ref.startsWith("mailto:") || ref.startsWith("tel:")) return false;
  if (ref.startsWith("#")) return false; // in-page anchor
  if (ref.startsWith("data:")) return false;
  if (ref.startsWith("/_vercel/")) return false; // Vercel system routes
  return true;
}

function resolveLocalPath(htmlFile, ref) {
  const clean = ref.split("#")[0].split("?")[0];
  if (clean === "") return null; // pure anchor/query, nothing to check
  if (clean.startsWith("/")) {
    // Site-root-relative. Could be a real file path, or a clean URL that
    // only resolves via a vercel.json rewrite (e.g. "/explore").
    if (clean === "/") return path.join(ROOT, "index.html");
    if (REWRITES.has(clean)) return path.join(ROOT, REWRITES.get(clean));
    return path.join(ROOT, clean);
  }
  return path.resolve(path.dirname(htmlFile), clean);
}

function main() {
  const htmlFiles = findHtmlFiles(ROOT);
  const failures = [];

  for (const file of htmlFiles) {
    const content = fs.readFileSync(file, "utf8");
    let match;
    while ((match = ATTR_RE.exec(content))) {
      const ref = match[1];
      if (!isLocalReference(ref)) continue;
      let resolved = resolveLocalPath(file, ref);
      if (resolved === null) continue;
      // A clean-URL directory route (e.g. "/explore" -> the "explore/"
      // directory) only actually serves something if it has an index.html —
      // an empty/missing directory would 404 in production even though
      // fs.existsSync("explore/") is true.
      if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
        resolved = path.join(resolved, "index.html");
      }
      if (!fs.existsSync(resolved)) {
        failures.push({ file: path.relative(ROOT, file), ref, resolved: path.relative(ROOT, resolved) });
      }
    }
  }

  if (failures.length > 0) {
    console.error(`Found ${failures.length} broken local reference(s):\n`);
    for (const f of failures) {
      console.error(`  ${f.file}: "${f.ref}" -> missing ${f.resolved}`);
    }
    process.exit(1);
  }

  console.log(`OK — checked ${htmlFiles.length} HTML file(s), all local references resolve.`);
}

main();
