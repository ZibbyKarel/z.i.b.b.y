import type { ChildProcess } from "node:child_process";
import { BrowserWindow, app, dialog } from "electron";
import { apiEntry, dataRoot, webServerEntry, worktreeRoot } from "./paths";
import { isHealthy, killChild, resolveLoginShellPath, spawnNodeChild, waitForHealthy } from "./processes";

// app.getPath('userData') otherwise derives from package.json's "name"
// (@zibby/desktop) — set before any getPath() call so data lands under the
// name an operator actually recognizes (~/Library/Application Support/ZIBBY).
app.setName("ZIBBY");

const API_PORT = 3333;
const WEB_PORT = 3000;
const API_HEALTH_URL = `http://localhost:${API_PORT}/api/health`;
const WEB_HEALTH_URL = `http://localhost:${WEB_PORT}/`;

let apiChild: ChildProcess | undefined;
let webChild: ChildProcess | undefined;
let mainWindow: BrowserWindow | undefined;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(bootstrap).catch(onFatalStartupError);
}

async function bootstrap(): Promise<void> {
  const loginShellPath = await resolveLoginShellPath();

  // Start-or-attach: if the operator already has the launchd daemon (or a
  // dev server) running on these ports, don't spawn a second one — just
  // point the window at what's already there.
  if (!(await isHealthy(API_HEALTH_URL))) {
    apiChild = spawnNodeChild(apiEntry(), {
      ...process.env,
      PATH: loginShellPath,
      PORT: String(API_PORT),
      CORS_ORIGIN: `http://localhost:${WEB_PORT}`,
      ZIBBY_DATA_DIR: dataRoot(),
      ZIBBY_WORKTREE_ROOT: worktreeRoot(),
    });
    pipeChildLogs(apiChild, "api");
  }

  if (!(await isHealthy(WEB_HEALTH_URL))) {
    webChild = spawnNodeChild(webServerEntry(), {
      ...process.env,
      PATH: loginShellPath,
      PORT: String(WEB_PORT),
      HOSTNAME: "localhost",
    });
    pipeChildLogs(webChild, "web");
  }

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
}

function pipeChildLogs(child: ChildProcess, label: string): void {
  child.stdout?.on("data", (chunk: Buffer) => process.stdout.write(`[${label}] ${chunk}`));
  child.stderr?.on("data", (chunk: Buffer) => process.stderr.write(`[${label}] ${chunk}`));
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    title: "ZIBBY",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.on("closed", () => {
    mainWindow = undefined;
  });
  void mainWindow.loadURL(`http://localhost:${WEB_PORT}/`);
}

function onStartupTimeout(what: string, port: number): void {
  dialog.showErrorBox(
    "ZIBBY couldn't start",
    `The ${what} didn't come up on port ${port} in time. Check that nothing else is using that port and try again.`,
  );
  app.quit();
}

function onFatalStartupError(err: unknown): void {
  dialog.showErrorBox("ZIBBY failed to start", err instanceof Error ? err.message : String(err));
  app.quit();
}

app.on("window-all-closed", () => {
  app.quit();
});

app.on("before-quit", (event) => {
  event.preventDefault();
  void Promise.all([apiChild ? killChild(apiChild) : Promise.resolve(), webChild ? killChild(webChild) : Promise.resolve()]).then(
    () => app.exit(0),
  );
});
