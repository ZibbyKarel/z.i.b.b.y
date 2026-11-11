import { contextBridge, ipcRenderer } from "electron";

/** The find bar overlay's only bridge (see findBar.ts) — never loaded into the web UI. */
contextBridge.exposeInMainWorld("zibbyFind", {
  find: (text: string, forward: boolean): void => ipcRenderer.send("zibby:find", text, forward),
  close: (): void => ipcRenderer.send("zibby:find-close"),
  onResult: (cb: (active: number, total: number) => void): void => {
    ipcRenderer.on("zibby:find-result", (_e, active: number, total: number) => cb(active, total));
  },
  onStep: (cb: (forward: boolean) => void): void => {
    ipcRenderer.on("zibby:find-step", (_e, forward: boolean) => cb(forward));
  },
});
