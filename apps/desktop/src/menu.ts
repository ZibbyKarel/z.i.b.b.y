import { app } from "electron";

export type FindCommand = "open" | "next" | "previous";

export interface MenuActions {
  onCheckForUpdates(): void;
  onFind(command: FindCommand): void;
}

/**
 * The app menu. Edit is spelled out (not `role: "editMenu"`) because Electron has no
 * find-in-page of its own — Cmd+F only works once a menu item claims it (todo-15).
 */
export function buildMenuTemplate(actions: MenuActions): Electron.MenuItemConstructorOptions[] {
  return [
    {
      label: app.name,
      submenu: [
        { role: "about" },
        { label: "Check for Updates…", click: () => actions.onCheckForUpdates() },
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
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "pasteAndMatchStyle" },
        { role: "delete" },
        { role: "selectAll" },
        { type: "separator" },
        { label: "Find…", accelerator: "CmdOrCtrl+F", click: () => actions.onFind("open") },
        { label: "Find Next", accelerator: "CmdOrCtrl+G", click: () => actions.onFind("next") },
        {
          label: "Find Previous",
          accelerator: "Shift+CmdOrCtrl+G",
          click: () => actions.onFind("previous"),
        },
      ],
    },
    { role: "viewMenu" },
    { role: "windowMenu" },
  ];
}
