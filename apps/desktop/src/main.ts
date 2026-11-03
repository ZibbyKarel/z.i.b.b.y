import type { ChildProcess } from "node:child_process";
import { createWriteStream, mkdirSync } from "node:fs";
import path from "node:path";
import { BrowserWindow, Menu, app, dialog } from "electron";
import { API_BASE_URL, API_HEALTH_URL, API_PORT, WEB_HEALTH_URL, WEB_PORT } from "./config";
import { routeExternalLinks } from "./externalLinks";
import { findForeignOwner, isPidAlive, readLockFile } from "./instanceLock";
import { apiEntry, instanceLockFile, logDir, readBuildInfo, webServerEntry } from "./paths";
import {
  isPortTaken,
  killChild,
  resolveLoginShellPath,
  spawnNodeChild,
  waitForHealthy,
} from "./processes";
import { checkForUpdates, startUpdateChecks } from "./updater";

// app.getPath('userData') otherwise derives from package.json's "name"
// (@zibby/desktop) — set before any getPath() call so data lands under
// ~/Library/Application Support/ZibbyOS.
app.setName("ZibbyOS");

let apiChild: ChildProcess | undefined;
let webChild: ChildProcess | undefined;
let mainWindow: BrowserWindow | undefined;
let quitting = false;

const WEB_ORIGIN = `http://localhost:${WEB_PORT}`;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) {
      // Window closed but the app (and its servers) still running in the Dock.
      if (apiChild && webChild) createWindow();
      return;
    }
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(bootstrap).catch(onFatalStartupError);
}

async function bootstrap(): Promise<void> {
  Menu.setApplicationMenu(Menu.buildFromTemplate(buildMenuTemplate()));

  const owner = findForeignOwner(readLockFile(instanceLockFile()), API_PORT, isPidAlive);
  if (owner) {
    fatal(
      "ZibbyOS can't start",
      `Another ZibbyOS instance (pid ${owner.pid}, port ${owner.port}) owns background work. If it is the dev server: stop it, start ZibbyOS, then start the dev server again — it will join as secondary.`,
    );
    return;
  }

  const [apiTaken, webTaken] = await Promise.all([isPortTaken(API_PORT), isPortTaken(WEB_PORT)]);
  if (apiTaken || webTaken) {
    const ports = [apiTaken ? API_PORT : undefined, webTaken ? WEB_PORT : undefined]
      .filter(Boolean)
      .join(" and ");
    fatal(
      "ZibbyOS can't start",
      `Port ${ports} is already in use. Probably a second copy of ZibbyOS is running or a stale process was left behind. Quit it and try again.`,
    );
    return;
  }

  const loginShellPath = await resolveLoginShellPath();
  const { sourceRoot } = readBuildInfo();

  apiChild = spawnNodeChild(apiEntry(), {
    ...process.env,
    PATH: loginShellPath,
    PORT: String(API_PORT),
    CORS_ORIGIN: `http://localhost:${WEB_PORT}`,
    ZIBBY_ROLE: "primary",
    // Dev reads this from apps/api/.env (cwd-relative, absent in the bundle). The
    // app always runs real agents; without it workflows fall back to demo stages.
    AGENT_RUNNER_MODE: "claude",
    ZIBBY_SOURCE_ROOT: sourceRoot,
  });
  pipeChildLogs(apiChild, "api");

  webChild = spawnNodeChild(webServerEntry(), {
    ...process.env,
    PATH: loginShellPath,
    PORT: String(WEB_PORT),
    HOSTNAME: "localhost",
  });
  pipeChildLogs(webChild, "web");

  const apiReady = await waitForHealthy(API_HEALTH_URL, { timeoutMs: 30_000, intervalMs: 500 });
  if (!apiReady) {
    onStartupTimeout("API", API_PORT);
    return;
  }

  const webReady = await waitForHealthy(WEB_HEALTH_URL, { timeoutMs: 30_000, intervalMs: 500 });
  if (!webReady) {
    onStartupTimeout("web app", WEB_PORT);
    return;
  }

  createWindow();
  startUpdateChecks({ apiBaseUrl: API_BASE_URL });
}

function buildMenuTemplate(): Electron.MenuItemConstructorOptions[] {
  return [
    {
      label: app.name,
      submenu: [
        { role: "about" },
        { label: "Check for Updates…", click: () => void checkForUpdates({ manual: true }) },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    { role: "editMenu" },
    { role: "viewMenu" },
    { role: "windowMenu" },
  ];
}

function pipeChildLogs(child: ChildProcess, label: "api" | "web"): void {
  mkdirSync(logDir(), { recursive: true });
  const log = createWriteStream(path.join(logDir(), `${label}.log`), { flags: "a" });
  log.write(`\n--- ${new Date().toISOString()} ${label} start ---\n`);
  child.stdout?.on("data", (chunk: Buffer) => {
    log.write(chunk);
    process.stdout.write(`[${label}] ${chunk}`);
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    log.write(chunk);
    process.stderr.write(`[${label}] ${chunk}`);
  });
  child.once("exit", () => log.end());
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    title: "ZibbyOS",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.on("closed", () => {
    mainWindow = undefined;
  });
  routeExternalLinks(mainWindow, WEB_ORIGIN);
  void mainWindow.loadURL(`${WEB_ORIGIN}/`);
}

function fatal(title: string, message: string): void {
  dialog.showErrorBox(title, message);
  quitting = true;
  app.exit(1);
}

function onStartupTimeout(what: string, port: number): void {
  dialog.showErrorBox(
    "ZibbyOS couldn't start",
    `The ${what} didn't come up on port ${port} in time. Check ${logDir()} for details and try again.`,
  );
  app.quit();
}

function onFatalStartupError(err: unknown): void {
  dialog.showErrorBox("ZibbyOS failed to start", err instanceof Error ? err.message : String(err));
  app.quit();
}

// Standard macOS behaviour: closing the window keeps the app (and its
// servers) running in the Dock. Cmd+Q quits.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (!mainWindow && apiChild && webChild) createWindow();
});

app.on("before-quit", (event) => {
  if (quitting) return;
  quitting = true;
  event.preventDefault();
  void Promise.all([
    apiChild ? killChild(apiChild) : Promise.resolve(),
    webChild ? killChild(webChild) : Promise.resolve(),
  ]).then(() => app.exit(0));
});
