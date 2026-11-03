import type { BrowserWindow } from "electron";
import { shell } from "electron";

const EXTERNAL_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

/** Where a URL the web app tries to open or navigate to should go. */
export function classifyUrl(url: string, appOrigin: string): "internal" | "external" | "blocked" {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "blocked";
  }
  if (parsed.origin === appOrigin) return "internal";
  return EXTERNAL_PROTOCOLS.has(parsed.protocol) ? "external" : "blocked";
}

/**
 * Keeps the app window on the app: links to any other origin (target=_blank,
 * window.open, or a plain navigation) open in the default browser instead of
 * inside ZibbyOS. Non-web schemes (file:, javascript:, custom handlers) are dropped.
 */
export function routeExternalLinks(win: BrowserWindow, appOrigin: string): void {
  win.webContents.setWindowOpenHandler(({ url }) => {
    const kind = classifyUrl(url, appOrigin);
    if (kind === "external") void shell.openExternal(url);
    return kind === "internal" ? { action: "allow" } : { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    const kind = classifyUrl(url, appOrigin);
    if (kind === "internal") return;
    event.preventDefault();
    if (kind === "external") void shell.openExternal(url);
  });
}
