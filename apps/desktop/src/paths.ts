import { app } from "electron";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Packaged app: bundled resources live under Contents/Resources
 * (electron-builder's `extraResources`). Unpackaged dev run (`electron .`):
 * fall back to the resources/ dir produced by `pnpm --filter @zibby/desktop
 * stage`, staged as a sibling of dist/ rather than inside it.
 */
export function resourcesRoot(): string {
  return app.isPackaged ? process.resourcesPath : path.join(__dirname, "../resources");
}

export function apiEntry(): string {
  return path.join(resourcesRoot(), "api/dist/main.js");
}

export function webServerEntry(): string {
  return path.join(resourcesRoot(), "web/apps/web/server.js");
}

/** Lock file the API writes when it owns background work (shared data dir). */
export function instanceLockFile(): string {
  return path.join(app.getPath("userData"), "data", ".instance.lock");
}

/** Baked at stage time by scripts/stage-resources.mjs. */
export interface BuildInfo {
  sourceRoot: string;
  builtAt: string;
  gitSha: string;
}

export function readBuildInfo(): BuildInfo {
  const file = path.join(resourcesRoot(), "build-info.json");
  return JSON.parse(readFileSync(file, "utf8")) as BuildInfo;
}

export function logDir(): string {
  return path.join(app.getPath("home"), "Library/Logs/ZibbyOS");
}
