import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { BrowserWindow, Notification, app, dialog } from "electron";
import { logDir } from "../paths";
import { fetchBusyRunCount } from "./activeRuns";
import { canReplace, installedBundlePath, launchSwap, prepareUpdate } from "./install";
import { type AvailableUpdate, DEFAULT_RELEASES_URL, fetchReleases, pickUpdate } from "./release";

/** Lets the window finish loading before a dialog can pop over it. */
const FIRST_CHECK_DELAY_MS = 5_000;
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const RUN_POLL_INTERVAL_MS = 30_000;

type Phase = "idle" | "checking" | "downloading" | "waiting-for-runs" | "installing";

export interface UpdaterOptions {
  /** Base URL of the app's own API, used to see whether a restart would kill runs. */
  apiBaseUrl: string;
}

let phase: Phase = "idle";
let options: UpdaterOptions | undefined;

function log(message: string): void {
  try {
    mkdirSync(logDir(), { recursive: true });
    appendFileSync(path.join(logDir(), "updater.log"), `${new Date().toISOString()} ${message}\n`);
  } catch {
    // Logging must never break the app.
  }
}

function updatesDir(): string {
  return path.join(app.getPath("userData"), "updates");
}

function stateFile(): string {
  return path.join(updatesDir(), "state.json");
}

function readSkippedVersion(): string | undefined {
  try {
    const parsed = JSON.parse(readFileSync(stateFile(), "utf8")) as { skippedVersion?: unknown };
    return typeof parsed.skippedVersion === "string" ? parsed.skippedVersion : undefined;
  } catch {
    return undefined;
  }
}

function writeSkippedVersion(version: string): void {
  mkdirSync(updatesDir(), { recursive: true });
  writeFileSync(stateFile(), JSON.stringify({ skippedVersion: version }, null, 2));
}

function releasesUrl(): string {
  // Test seam: point the updater at a local feed instead of GitHub.
  return process.env.ZIBBY_UPDATE_RELEASES_URL ?? DEFAULT_RELEASES_URL;
}

function focusedWindow(): BrowserWindow | undefined {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
}

async function showBox(opts: Electron.MessageBoxOptions): Promise<number> {
  const win = focusedWindow();
  const result = win ? await dialog.showMessageBox(win, opts) : await dialog.showMessageBox(opts);
  return result.response;
}

function setProgress(fraction: number): void {
  for (const win of BrowserWindow.getAllWindows()) win.setProgressBar(fraction);
}

function trimNotes(notes: string): string {
  const text = notes.trim();
  return text.length > 900 ? `${text.slice(0, 900)}…` : text;
}

/** Starts the background schedule: one check at startup, then every 24 hours. */
export function startUpdateChecks(opts: UpdaterOptions): void {
  options = opts;
  if (!app.isPackaged) return;
  setTimeout(() => void checkForUpdates({ manual: false }), FIRST_CHECK_DELAY_MS);
  setInterval(() => void checkForUpdates({ manual: false }), CHECK_INTERVAL_MS);
}

/**
 * One check. `manual` (the menu item) reports "up to date" and errors in a dialog and
 * ignores a skipped version; the scheduled check stays silent unless there is news.
 * `install` (Settings → Updates' "Download and install") skips the Update/Later/Skip
 * question — the operator already chose.
 */
export async function checkForUpdates({
  manual,
  install = false,
}: {
  manual: boolean;
  install?: boolean;
}): Promise<void> {
  if (phase !== "idle") {
    if (manual) await showBox({ type: "info", message: "An update is already in progress." });
    return;
  }
  if (!app.isPackaged) {
    if (manual) await showBox({ type: "info", message: "Updates only work in the installed app." });
    return;
  }

  phase = "checking";
  let update: AvailableUpdate | undefined;
  try {
    update = pickUpdate(await fetchReleases(releasesUrl()), app.getVersion(), process.arch);
  } catch (err) {
    phase = "idle";
    log(`check failed: ${String(err)}`);
    if (manual) {
      await showBox({
        type: "error",
        message: "Couldn't check for updates",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
    return;
  }
  phase = "idle";

  if (!update) {
    log(`check: up to date (${app.getVersion()})`);
    if (manual) {
      await showBox({ type: "info", message: `ZibbyOS ${app.getVersion()} is up to date.` });
    }
    return;
  }
  if (!manual && readSkippedVersion() === update.version) {
    log(`check: ${update.version} available but skipped by the operator`);
    return;
  }
  log(`check: ${update.version} available`);
  await offerUpdate(update, install);
}

async function offerUpdate(update: AvailableUpdate, confirmed: boolean): Promise<void> {
  const notes = trimNotes(update.notes);
  const choice = confirmed
    ? 0
    : await showBox({
        type: "info",
        buttons: ["Update", "Later", "Skip This Version"],
        defaultId: 0,
        cancelId: 1,
        message: `ZibbyOS ${update.version} is available`,
        detail: `You have ${app.getVersion()}.${notes ? `\n\n${notes}` : ""}`,
      });
  if (choice === 2) {
    writeSkippedVersion(update.version);
    return;
  }
  if (choice !== 0) return;

  const bundle = installedBundlePath(process.execPath);
  if (!bundle || !(await canReplace(bundle))) {
    await showBox({
      type: "warning",
      message: "ZibbyOS can't update itself from here",
      detail:
        "Move ZibbyOS.app into /Applications (not run from the DMG) and make sure you can write to it, then try again.",
    });
    return;
  }

  phase = "downloading";
  let nextBundle: string;
  try {
    nextBundle = await prepareUpdate(
      update,
      path.join(updatesDir(), `staging-${update.version}`),
      setProgress,
    );
  } catch (err) {
    phase = "idle";
    log(`download failed: ${String(err)}`);
    await showBox({
      type: "error",
      message: `Couldn't download ZibbyOS ${update.version}`,
      detail: err instanceof Error ? err.message : String(err),
    });
    return;
  } finally {
    setProgress(-1);
  }
  log(`downloaded ${update.version} to ${nextBundle}`);
  await installWhenSafe(update, bundle, nextBundle);
}

async function installWhenSafe(
  update: AvailableUpdate,
  bundle: string,
  nextBundle: string,
): Promise<void> {
  const apiBaseUrl = options?.apiBaseUrl ?? "";
  const busy = await fetchBusyRunCount(apiBaseUrl);
  if (busy === 0) {
    await install(update, bundle, nextBundle);
    return;
  }

  const choice = await showBox({
    type: "question",
    buttons: ["Install When Runs Finish", "Restart Now", "Cancel"],
    defaultId: 0,
    cancelId: 2,
    message: `${busy} run${busy === 1 ? " is" : "s are"} still in progress`,
    detail: `Restarting now interrupts ${busy === 1 ? "it" : "them"}. ZibbyOS ${update.version} is downloaded and can install as soon as nothing is running.`,
  });
  if (choice === 1) {
    await install(update, bundle, nextBundle);
    return;
  }
  if (choice !== 0) {
    phase = "idle";
    return;
  }

  phase = "waiting-for-runs";
  log(`waiting for ${busy} run(s) before installing ${update.version}`);
  const timer = setInterval(() => {
    void fetchBusyRunCount(apiBaseUrl).then(async (count) => {
      if (count > 0 || phase !== "waiting-for-runs") return;
      clearInterval(timer);
      await install(update, bundle, nextBundle);
    });
  }, RUN_POLL_INTERVAL_MS);
}

async function install(update: AvailableUpdate, bundle: string, nextBundle: string): Promise<void> {
  phase = "installing";
  log(`installing ${update.version} over ${bundle}`);
  try {
    await launchSwap(
      {
        pid: process.pid,
        current: bundle,
        next: nextBundle,
        backup: path.join(updatesDir(), "previous", path.basename(bundle)),
        logFile: path.join(logDir(), "updater.log"),
      },
      path.join(updatesDir(), "swap.sh"),
    );
  } catch (err) {
    phase = "idle";
    log(`install failed: ${String(err)}`);
    await showBox({
      type: "error",
      message: `Couldn't install ZibbyOS ${update.version}`,
      detail: err instanceof Error ? err.message : String(err),
    });
    return;
  }
  if (Notification.isSupported()) {
    new Notification({
      title: "ZibbyOS",
      body: `Installing ${update.version} — ZibbyOS restarts in a moment.`,
    }).show();
  }
  app.quit();
}
