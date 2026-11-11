import path from "node:path";
import { type BrowserWindow, WebContentsView, ipcMain } from "electron";
import type { FindCommand } from "./menu";

/**
 * The `findInPage` options for a query, or null to stop. A changed text starts a new
 * search session (`findNext: true`); the same text steps to the next/previous match.
 */
export function findRequest(
  last: string,
  text: string,
  forward: boolean,
): { forward: boolean; findNext: boolean } | null {
  if (!text) return null;
  return { forward, findNext: text !== last };
}

const WIDTH = 340;
const HEIGHT = 44;
const MARGIN = 12;

// Our own markup in a separate view, so the query text never matches itself on the page.
const HTML = `<!doctype html><meta charset="utf-8"><style>
:root{color-scheme:light dark}
html,body{margin:0;height:100%;overflow:hidden;font:13px -apple-system,system-ui,sans-serif}
body{display:flex;align-items:center;gap:8px;padding:0 10px;box-sizing:border-box;
background:Canvas;color:CanvasText;border:1px solid color-mix(in srgb,CanvasText 20%,transparent);border-radius:8px}
input{flex:1;min-width:0;font:inherit;padding:4px 6px;border-radius:5px;border:1px solid color-mix(in srgb,CanvasText 25%,transparent);background:transparent;color:inherit;outline:none}
#n{min-width:48px;text-align:right;opacity:.6;font-variant-numeric:tabular-nums}
button{font:inherit;border:0;background:transparent;color:inherit;cursor:pointer;padding:2px 6px;border-radius:4px}
button:hover{background:color-mix(in srgb,CanvasText 12%,transparent)}
</style>
<input id="q" placeholder="Find in page" aria-label="Find in page" autofocus>
<span id="n" aria-live="polite"></span>
<button id="p" aria-label="Previous match">&#8593;</button>
<button id="x" aria-label="Next match">&#8595;</button>
<button id="c" aria-label="Close">&#10005;</button>
<script>
const q=document.getElementById("q"),n=document.getElementById("n");
const go=(f)=>zibbyFind.find(q.value,f);
q.addEventListener("input",()=>{if(!q.value)n.textContent="";go(true)});
q.addEventListener("keydown",(e)=>{if(e.key==="Enter")go(!e.shiftKey);if(e.key==="Escape")zibbyFind.close()});
document.getElementById("p").onclick=()=>go(false);
document.getElementById("x").onclick=()=>go(true);
document.getElementById("c").onclick=()=>zibbyFind.close();
zibbyFind.onResult((a,t)=>{n.textContent=q.value?a+"/"+t:""});
zibbyFind.onStep((f)=>go(f));
window.addEventListener("focus",()=>q.select());
</script>`;

/** Cmd+F for one window: a small find bar overlay driving `webContents.findInPage`. */
export function attachFindBar(win: BrowserWindow): (command: FindCommand) => void {
  const page = win.webContents;
  let view: WebContentsView | undefined;
  let open = false;
  let last = "";
  // Resolves once the bar's markup (and its preload bridge) is live — a step sent before is lost.
  let loaded: Promise<unknown> = Promise.resolve();

  const place = () => {
    const { width } = win.getContentBounds();
    view?.setBounds({ x: width - WIDTH - MARGIN, y: MARGIN, width: WIDTH, height: HEIGHT });
  };

  const close = () => {
    if (!open || !view) return;
    open = false;
    last = "";
    page.stopFindInPage("clearSelection");
    win.contentView.removeChildView(view);
    page.focus();
  };

  const onFind = (event: Electron.IpcMainEvent, text: unknown, forward: unknown) => {
    if (event.sender !== view?.webContents || typeof text !== "string") return;
    const req = findRequest(last, text, forward !== false);
    last = text;
    if (req) page.findInPage(text, req);
    else page.stopFindInPage("clearSelection");
  };
  const onClose = (event: Electron.IpcMainEvent) => {
    if (event.sender === view?.webContents) close();
  };
  ipcMain.on("zibby:find", onFind);
  ipcMain.on("zibby:find-close", onClose);
  // Esc closes the bar from the page too, not only from its own field.
  page.on("before-input-event", (event, input) => {
    if (open && input.type === "keyDown" && input.key === "Escape") {
      event.preventDefault();
      close();
    }
  });
  page.on("found-in-page", (_e, result) => {
    view?.webContents.send("zibby:find-result", result.activeMatchOrdinal, result.matches);
  });
  win.on("resize", place);
  win.on("closed", () => {
    ipcMain.off("zibby:find", onFind);
    ipcMain.off("zibby:find-close", onClose);
    view?.webContents.close();
  });

  return (command) => {
    if (!view) {
      view = new WebContentsView({
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          preload: path.join(__dirname, "findBarPreload.js"),
        },
      });
      view.webContents.on("will-navigate", (e) => e.preventDefault());
      loaded = view.webContents
        .loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(HTML)}`)
        .catch(() => undefined);
    }
    const shown = open;
    if (!open) {
      open = true;
      win.contentView.addChildView(view);
      place();
    }
    const bar = view.webContents;
    // A freshly shown bar takes focus whatever opened it, so the operator can type right away.
    if (command === "open" || !shown) bar.focus();
    if (command !== "open") void loaded.then(() => bar.send("zibby:find-step", command === "next"));
  };
}
