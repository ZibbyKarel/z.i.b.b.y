#!/usr/bin/env node
// Produces a self-contained, runnable production copy of the API: compiled
// dist/, a flat/hoisted production-only node_modules, and a
// hand-built @zibby/contracts entry pointing at its compiled dist instead
// of raw .ts source (a plain `node` process can't require() a .ts file, but
// that's exactly what @zibby/contracts's package.json points at for dev).
// None of this touches the live repo's package.json files or dev symlinks.
//
// Why not `pnpm deploy`: it deploys via pnpm's nested `.pnpm` virtual store
// (symlink chains), and in `--legacy` mode (needed to avoid requiring
// inject-workspace-packages) it doesn't reliably resolve transitive
// dependencies of dependencies (e.g. `tslib`, needed by `@nestjs/common`
// but not a direct dependency of @zibby/api) into the deployed tree —
// confirmed by booting the result and hitting MODULE_NOT_FOUND. A plain,
// fully-hoisted `pnpm install` in an isolated scratch dir has none of that
// nested-store complexity: every dependency (direct or transitive) ends up
// as a real, flat top-level node_modules/<pkg> directory.
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(apiRoot, "../..");
const contractsRoot = path.join(repoRoot, "libs/contracts");

const stageDir = process.argv[2] ? path.resolve(process.argv[2]) : path.join(apiRoot, ".stage/prod");
// Install somewhere entirely outside this pnpm workspace — a directory
// inside the workspace tree gets its ambient pnpm-workspace.yaml picked up
// by a nested `pnpm install`, scoping it to all monorepo projects instead of
// just this scratch package (confirmed earlier: it pruned the root's
// devDependencies).
const deployDir = path.join(os.tmpdir(), "zibby-api-stage");

function run(cmd, args, cwd, env) {
  console.log(`$ ${cmd} ${args.join(" ")}`);
  execFileSync(cmd, args, { cwd, stdio: "inherit", env: env ? { ...process.env, ...env } : process.env });
}

/** rsync -aL dereferences symlinks into real copies, and — unlike `cp -RL`
 * — tolerates individual broken ones (exit code 23, "partial transfer due
 * to error"), which a hoisted install can still produce for optional
 * platform-specific binaries that don't apply to this OS/arch. */
function rsyncDereferenced(src, dst) {
  console.log(`$ rsync -aL ${src}/ ${dst}/`);
  try {
    execFileSync("rsync", ["-aL", `${src}/`, `${dst}/`], { stdio: "inherit" });
  } catch (err) {
    if (err.status !== 23) throw err;
  }
}

run("pnpm", ["--filter", "@zibby/contracts", "build"], repoRoot);
run("pnpm", ["--filter", "@zibby/api", "build"], repoRoot);

rmSync(deployDir, { recursive: true, force: true });
mkdirSync(deployDir, { recursive: true });

// A standalone package.json with @zibby/api's real dependencies, minus
// @zibby/contracts (workspace:* only resolves inside a pnpm workspace, and
// we're deliberately installing outside one — contracts is handled below by
// hand instead).
const apiPkg = JSON.parse(readFileSync(path.join(apiRoot, "package.json"), "utf8"));
const externalDeps = { ...apiPkg.dependencies };
delete externalDeps["@zibby/contracts"];
writeFileSync(
  path.join(deployDir, "package.json"),
  JSON.stringify({ name: "zibby-api-runtime", version: "0.0.0", private: true, dependencies: externalDeps }, null, 2),
);

// --ignore-scripts: apps/api has zero native dependencies (verified), so no
// install/postinstall step here does anything the runtime needs — this just
// skips telemetry postinstalls (e.g. @scarf/scarf, already blocked in the
// monorepo's own pnpm-workspace.yaml) that would otherwise gate a fresh
// standalone install with no allowBuilds config to inherit.
run("pnpm", ["install", "--prod", "--ignore-scripts", "--config.node-linker=hoisted"], deployDir);

cpSync(path.join(apiRoot, "dist"), path.join(deployDir, "dist"), { recursive: true });

const contractsDeployPath = path.join(deployDir, "node_modules/@zibby/contracts");
mkdirSync(contractsDeployPath, { recursive: true });
cpSync(path.join(contractsRoot, "dist"), path.join(contractsDeployPath, "dist"), { recursive: true });
writeFileSync(
  path.join(contractsDeployPath, "package.json"),
  JSON.stringify(
    {
      name: "@zibby/contracts",
      version: "0.1.0",
      private: true,
      main: "./dist/index.js",
      types: "./dist/index.d.ts",
      exports: { ".": "./dist/index.js" },
    },
    null,
    2,
  ),
);

rmSync(stageDir, { recursive: true, force: true });
mkdirSync(stageDir, { recursive: true });
rsyncDereferenced(deployDir, stageDir);
rmSync(deployDir, { recursive: true, force: true });

console.log(`Staged production API at ${stageDir}`);
