#!/usr/bin/env node
// ZibbyCorp code codemod (ZC-01..ZC-04): subsystem → department + persona ids →
// department ids / function words, over tracked source files, plus `git mv` of
// every path whose name contains a token. Data dirs are NOT touched here — see
// `zibbycorp-departments.mjs`. Usage:
//   node tools/migrate/zibbycorp-codemod.mjs [--apply] [--scope <pathspec>...]
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { rewrite, rewritePath } from "./zibbycorp-map.mjs";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const scopeIdx = args.indexOf("--scope");
const scopes = scopeIdx >= 0 ? args.slice(scopeIdx + 1) : ["apps", "libs", "tools", "e2e"];

const EXCLUDE = [
  /^tools\/migrate\//,
  /^\.zibby\//,
  /(^|\/)data-test\//,
  /^graphify-out\//,
  /(^|\/)graphify-out\//,
  /^docs\/plans\//,
  /\.(png|jpe?g|gif|webp|ico|woff2?|ttf|zip|tgz|pdf|mp3|wav)$/i,
  /pnpm-lock\.yaml$/,
];

const files = execFileSync("git", ["ls-files", "-z", "--", ...scopes], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean)
  .filter((f) => !EXCLUDE.some((re) => re.test(f)))
  .filter((f) => existsSync(f) && lstatSync(f).isFile());

let changed = 0;
let moved = 0;
for (const file of files) {
  const before = readFileSync(file, "utf8");
  const after = rewrite(before);
  const target = rewritePath(file);
  if (after !== before) {
    changed++;
    if (apply) writeFileSync(file, after);
    else console.log(`edit ${file}`);
  }
  if (target !== file) {
    moved++;
    if (apply) {
      mkdirSync(dirname(target), { recursive: true });
      if (existsSync(target)) throw new Error(`move target exists: ${file} → ${target}`);
      execFileSync("git", ["mv", file, target]);
    } else console.log(`move ${file} → ${target}`);
  }
}
console.log(`${apply ? "applied" : "dry-run"}: ${changed} files edited, ${moved} files moved`);
