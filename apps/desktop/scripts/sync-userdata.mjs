#!/usr/bin/env node
// Syncs this repo's .zibby/data into the installed ZIBBY.app's userData data
// directory, so the desktop app sees the same agents/pipelines/vault/etc. as
// the dev environment without a full desktop:build + reinstall. One-way,
// additive only (no rsync --delete) — never removes anything the running
// app created on its own since the last sync (e.g. new run history), and
// never touches the repo's copy.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");
const src = path.join(repoRoot, ".zibby/data");
// Matches paths.ts's dataRoot() — app.getPath('userData')/data — once
// src/main.ts has called app.setName("ZIBBY").
const dst = path.join(os.homedir(), "Library/Application Support/ZIBBY/data");

if (!existsSync(src)) {
  console.error(`No data to sync — ${src} doesn't exist.`);
  process.exit(1);
}

mkdirSync(dst, { recursive: true });

console.log(`$ rsync -a ${src}/ ${dst}/`);
execFileSync("rsync", ["-a", `${src}/`, `${dst}/`], { stdio: "inherit" });

console.log(`Synced ${src} -> ${dst}`);
console.log("Restart ZIBBY.app if it's currently running for it to pick up the change.");
