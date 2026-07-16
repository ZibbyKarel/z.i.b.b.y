import { app } from "electron";
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

/** Per-install data root — there's no repo checkout to anchor ZIBBY_DATA_DIR to. */
export function dataRoot(): string {
  return path.join(app.getPath("userData"), "data");
}

/** Kept outside the data root (Phase 12.7 convention: worktrees never live under the data tree). */
export function worktreeRoot(): string {
  return path.join(app.getPath("userData"), "worktrees");
}
