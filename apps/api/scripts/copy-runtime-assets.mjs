#!/usr/bin/env node
// tsc only emits .ts → .js. The API also spawns plain .mjs scripts that sit next
// to their service (resolved via `path.resolve(__dirname, "<name>.mjs")`): the
// Claude approval hook, the OpenAI stage and the demo stage. Copy every
// src/**/*.mjs into the same relative spot under dist/ so the built API (and the
// packaged ZibbyOS.app) can find them.
import { cpSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcRoot = path.join(apiRoot, "src");
const distRoot = path.join(apiRoot, "dist");

let copied = 0;
for (const entry of readdirSync(srcRoot, { recursive: true, withFileTypes: true })) {
  if (!entry.isFile() || !entry.name.endsWith(".mjs")) continue;
  const rel = path.relative(srcRoot, path.join(entry.parentPath, entry.name));
  mkdirSync(path.dirname(path.join(distRoot, rel)), { recursive: true });
  cpSync(path.join(srcRoot, rel), path.join(distRoot, rel));
  copied += 1;
}
console.log(`copy-runtime-assets: ${copied} .mjs file(s) → dist/`);
