import { contextBridge, ipcRenderer } from "electron";

/**
 * The one bridge the web UI gets into the app: the top-bar Upgrade button runs the
 * same updater as the app menu's "Check for Updates…". Read in apps/web as
 * `window.zibbyDesktop` (absent in a plain browser).
 */
contextBridge.exposeInMainWorld("zibbyDesktop", {
  checkForUpdates: (): Promise<void> => ipcRenderer.invoke("zibby:check-for-updates"),
  /** Settings → Updates: download and install straight away, no Update/Later question. */
  installUpdate: (): Promise<void> => ipcRenderer.invoke("zibby:install-update"),
});
