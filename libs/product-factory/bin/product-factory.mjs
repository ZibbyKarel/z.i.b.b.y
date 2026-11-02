#!/usr/bin/env -S node --no-warnings
// Node < 22.18 only strips TypeScript types behind a flag, and package-manager
// shims (pnpm) bake the shebang flags in at install time — so re-exec ourselves
// with the flag instead of relying on how we were launched.
import { spawnSync } from "node:child_process";

if (!process.features.typescript && !process.execArgv.includes("--experimental-strip-types")) {
  const r = spawnSync(
    process.execPath,
    ["--no-warnings", "--experimental-strip-types", ...process.argv.slice(1)],
    { stdio: "inherit" },
  );
  process.exit(r.status ?? 1);
}
await import("../src/cli.ts");
