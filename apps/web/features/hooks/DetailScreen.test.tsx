import { renderWithProviders as render, screen } from "../../test/render";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Hook } from "@zibby/contracts";
import { DetailScreen, HookDetailScreenTestId } from "./DetailScreen";
import { HookFormTestId } from "./components/HookFormFields";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const HOOK: Hook = {
  id: "audit-log",
  name: "Audit Log",
  event: "PreToolUse",
  matcher: "Bash",
  command: "./audit.sh",
  timeout: 30,
  enabled: true,
};

const { hooks } = vi.hoisted(() => ({
  hooks: {
    hook: { data: undefined as unknown, isPending: false, isError: false, refetch: vi.fn() },
    update: vi.fn(),
    del: vi.fn(),
  },
}));

vi.mock("./queries", () => ({
  useHookQuery: () => hooks.hook,
}));
vi.mock("./mutations", () => ({
  useUpdateHookMutation: () => ({ mutate: hooks.update, isPending: false }),
  useDeleteHookMutation: () => ({ mutate: hooks.del, isPending: false }),
}));

describe("hooks DetailScreen (N4e grammar)", () => {
  beforeEach(() => {
    push.mockClear();
    hooks.update.mockClear();
    hooks.del.mockClear();
    hooks.hook = { data: HOOK, isPending: false, isError: false, refetch: vi.fn() };
  });

  it("locks the id, shows top-right actions by accessible name", () => {
    render(<DetailScreen hookId="audit-log" />);
    expect(screen.getByRole("button", { name: "Uložit" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Smazat" })).toBeInTheDocument();
    // Locked id renders as text, not an input.
    expect(screen.getByTestId(HookFormTestId.Id).tagName).not.toBe("INPUT");
    expect(screen.getByTestId(HookFormTestId.Id)).toHaveTextContent("audit-log");
  });

  it("Save submits the edited patch to the update mutation", async () => {
    render(<DetailScreen hookId="audit-log" />);
    await userEvent.clear(screen.getByTestId(HookFormTestId.Command));
    await userEvent.type(screen.getByTestId(HookFormTestId.Command), "./v2.sh");
    await userEvent.click(screen.getByTestId(HookDetailScreenTestId.Save));
    expect(hooks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        params: { id: "audit-log" },
        body: expect.objectContaining({ command: "./v2.sh", event: "PreToolUse", timeout: 30 }),
      }),
    );
  });

  it("Delete asks in a CONFIRM dialog, then deletes and navigates back to /hooks", async () => {
    hooks.del.mockImplementation((_args, opts?: { onSuccess?: () => void }) =>
      opts?.onSuccess?.(),
    );
    render(<DetailScreen hookId="audit-log" />);
    await userEvent.click(screen.getByTestId(HookDetailScreenTestId.Delete));
    expect(screen.getByText("Smazat hook?")).toBeInTheDocument();
    const confirm = screen
      .getAllByRole("button", { name: "Smazat" })
      .find((b) => b !== screen.getByTestId(HookDetailScreenTestId.Delete));
    await userEvent.click(confirm!);
    expect(hooks.del).toHaveBeenCalledWith(
      { params: { id: "audit-log" } },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
    expect(push).toHaveBeenCalledWith("/hooks");
  });
});
