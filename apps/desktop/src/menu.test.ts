import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({ app: { name: "ZibbyOS" } }));

const { buildMenuTemplate } = await import("./menu");

describe("buildMenuTemplate (todo-15)", () => {
  const find = vi.fn();
  const navigate = vi.fn();
  const template = buildMenuTemplate({
    onCheckForUpdates: vi.fn(),
    onFind: find,
    onNavigate: navigate,
  });
  const edit = template.find((m) => m.label === "Edit");
  const items = Array.isArray(edit?.submenu) ? edit.submenu : [];
  const byAccel = (a: string) => items.find((i) => i.accelerator === a);

  it("keeps the standard edit roles (copy/paste must keep working)", () => {
    expect(items.map((i) => i.role).filter(Boolean)).toEqual(
      expect.arrayContaining(["undo", "redo", "cut", "copy", "paste", "selectAll"]),
    );
  });

  it("binds Cmd+F / Cmd+G / Shift+Cmd+G to find in page", () => {
    byAccel("CmdOrCtrl+F")?.click?.({} as never, undefined, {} as never);
    expect(find).toHaveBeenLastCalledWith("open");
    byAccel("CmdOrCtrl+G")?.click?.({} as never, undefined, {} as never);
    expect(find).toHaveBeenLastCalledWith("next");
    byAccel("Shift+CmdOrCtrl+G")?.click?.({} as never, undefined, {} as never);
    expect(find).toHaveBeenLastCalledWith("previous");
  });

  it("has a History menu where Cmd+[ / Cmd+] navigate back / forward (todo-6)", () => {
    const history = template.find((m) => m.label === "History");
    const hItems = Array.isArray(history?.submenu) ? history.submenu : [];
    hItems
      .find((i) => i.accelerator === "CmdOrCtrl+[")
      ?.click?.({} as never, undefined, {} as never);
    expect(navigate).toHaveBeenLastCalledWith("back");
    hItems
      .find((i) => i.accelerator === "CmdOrCtrl+]")
      ?.click?.({} as never, undefined, {} as never);
    expect(navigate).toHaveBeenLastCalledWith("forward");
    expect(template.findIndex((m) => m.label === "History")).toBe(
      template.findIndex((m) => m.label === "Edit") + 1,
    );
  });
});
