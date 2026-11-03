#!/usr/bin/env node
// Cuts a ZibbyOS desktop release: bumps apps/desktop/package.json, commits only that
// file, tags `desktop-v<version>` and pushes main + the tag. The tag push triggers
// .github/workflows/desktop-release.yml, which builds the app on a macOS runner and
// publishes the GitHub Release the installed app's updater reads.
//
//   pnpm desktop:release            # patch: 0.1.0 → 0.1.1
//   pnpm desktop:release minor      # 0.1.0 → 0.2.0
//   pnpm desktop:release 1.0.0      # explicit
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");
const pkgPath = path.join(repoRoot, "apps/desktop/package.json");
const pkgRel = path.relative(repoRoot, pkgPath);
const TAG_PREFIX = "desktop-v";

function git(args, opts = {}) {
  // With stdio: "inherit" execFileSync returns null (output went to the terminal).
  return (execFileSync("git", args, { cwd: repoRoot, encoding: "utf8", ...opts }) ?? "").trim();
}

function fail(message) {
  console.error(`desktop:release: ${message}`);
  process.exit(1);
}

function bump(current, kind) {
  const parts = current.split(".").map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN))
    fail(`current version "${current}" is not x.y.z`);
  const [major, minor, patch] = parts;
  if (kind === "major") return `${major + 1}.0.0`;
  if (kind === "minor") return `${major}.${minor + 1}.0`;
  if (kind === "patch") return `${major}.${minor}.${patch + 1}`;
  if (/^\d+\.\d+\.\d+$/.test(kind)) return kind;
  fail(`unknown bump "${kind}" — use patch, minor, major or an explicit x.y.z`);
}

const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]);
if (branch !== "main") fail(`releases are cut from main (you are on ${branch})`);
if (git(["status", "--porcelain", "--", pkgRel])) fail(`${pkgRel} has uncommitted changes`);

git(["fetch", "origin", "main", "--tags"], { stdio: "inherit" });
const behind = git(["rev-list", "--count", "HEAD..origin/main"]);
if (behind !== "0") fail(`main is ${behind} commit(s) behind origin/main — pull first`);

const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
const next = bump(pkg.version, process.argv[2] ?? "patch");
const tag = `${TAG_PREFIX}${next}`;
if (git(["tag", "-l", tag])) fail(`tag ${tag} already exists`);

pkg.version = next;
writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
console.log(`ZibbyOS ${pkg.version} → tag ${tag}`);

// The pre-commit self-knowledge gate checks the vault note against the code.
execFileSync("pnpm", ["self-knowledge:generate"], { cwd: repoRoot, stdio: "inherit" });
// Pathspec commit: never sweeps up files other sessions have staged.
git(["commit", "-m", `release(desktop): ZibbyOS ${next}`, "--", pkgRel], { stdio: "inherit" });
git(["tag", "-a", tag, "-m", `ZibbyOS ${next}`]);
git(["push", "--atomic", "origin", "main", tag], { stdio: "inherit" });

console.log(
  `\nPushed ${tag}. The build runs at https://github.com/ZibbyKarel/z.i.b.b.y/actions/workflows/desktop-release.yml`,
);
console.log(
  "When it finishes, the installed ZibbyOS offers the update within 6 hours (or now: ZibbyOS → Check for Updates…).",
);
