#!/usr/bin/env node
// Stages the production API and web server into apps/desktop/resources/,
// mirroring the layout electron-builder's extraResources maps into
// Contents/Resources at package time.
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(desktopRoot, "../..");
const webRoot = path.join(repoRoot, "apps/web");
const apiRoot = path.join(repoRoot, "apps/api");

const resourcesDir = path.join(desktopRoot, "resources");

function run(cmd, args, cwd) {
  console.log(`$ ${cmd} ${args.join(" ")}`);
  execFileSync(cmd, args, { cwd, stdio: "inherit" });
}

/** rsync -aL dereferences symlinks into real copies and tolerates
 * individual broken ones (exit code 23, "partial transfer due to error") —
 * unlike `cp -RL`, which aborts the whole copy on the first broken link. */
function rsyncDereferenced(src, dst) {
  console.log(`$ rsync -aL ${src}/ ${dst}/`);
  try {
    execFileSync("rsync", ["-aL", `${src}/`, `${dst}/`], { stdio: "inherit" });
  } catch (err) {
    if (err.status !== 23) throw err;
  }
}

rmSync(resourcesDir, { recursive: true, force: true });
mkdirSync(resourcesDir, { recursive: true });

// API: compiled dist/ + production-only node_modules, with @zibby/contracts
// swapped for its compiled dist (see apps/api/scripts/stage-prod.mjs — it
// ships raw .ts source, which a plain `node` process can't require()).
run("node", [path.join(apiRoot, "scripts/stage-prod.mjs"), path.join(resourcesDir, "api")], repoRoot);

// Web: Next's own traced `output: standalone` bundle, plus the two
// directories it doesn't copy itself (static assets + public/), per Next's
// own standalone-output docs.
run("pnpm", ["web:build"], repoRoot);
const webResourcesDir = path.join(resourcesDir, "web");
mkdirSync(webResourcesDir, { recursive: true });
// Next's traced node_modules can still contain symlinks into the live pnpm
// store (e.g. typescript) — dereference them into real copies so the staged
// output doesn't depend on anything outside itself.
rsyncDereferenced(path.join(webRoot, ".next/standalone"), webResourcesDir);
cpSync(path.join(webRoot, ".next/static"), path.join(webResourcesDir, "apps/web/.next/static"), { recursive: true });
cpSync(path.join(webRoot, "public"), path.join(webResourcesDir, "apps/web/public"), { recursive: true });

// Next's file tracer (@vercel/nft) misses a handful of packages it can't
// see statically — required conditionally inside next/dist/server's own
// require-hook/config in ways the tracer doesn't follow. Confirmed by
// booting the staged result and patching in each MODULE_NOT_FOUND in turn.
// None of these are hoisted to the repo's top-level node_modules (nothing
// besides `next` itself depends on them directly), so resolve each from the
// pnpm store and copy it in at the hoisted top-level node_modules Next's own
// standalone output otherwise uses.
const NFT_TRACING_GAPS = ["styled-jsx", "@swc/helpers", "@next/env"];
for (const pkg of NFT_TRACING_GAPS) {
  const pnpmDir = path.join(repoRoot, "node_modules/.pnpm");
  const prefix = `${pkg.replace("/", "+")}@`;
  const [storeEntry] = readdirSync(pnpmDir).filter((name) => name.startsWith(prefix));
  if (!storeEntry) throw new Error(`${pkg} not found in node_modules/.pnpm — check apps/web's dependencies`);
  const dst = path.join(webResourcesDir, "node_modules", pkg);
  rmSync(dst, { recursive: true, force: true });
  rsyncDereferenced(path.join(pnpmDir, storeEntry, "node_modules", pkg), dst);
}

console.log(`Staged desktop resources at ${resourcesDir}`);
