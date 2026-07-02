import { renderWithProviders as render, screen } from "../../test/render";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Hook } from "@zibby/contracts";
import { Screen } from "./Screen";
import { HookFormTestId } from "./components/HookFormDialog";

const hook: Hook = {
  id: "audit-log",
  name: "Audit Log",
  event: "PreToolUse",
  matcher: "Bash",
  command: "./audit.sh",
  enabled: true,
};

const createMutate = vi.fn();
const push = vi.fn();
let listData: Hook[] = [];

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

vi.mock("./queries", () => ({
  useHooksQuery: () => ({ data: listData }),
}));

vi.mock("./mutations", () => ({
  useCreateHookMutation: () => ({ mutate: createMutate, isPending: false }),
}));

beforeEach(() => {
  createMutate.mockReset();
  push.mockClear();
  listData = [];
});

describe("Hooks Screen", () => {
  it("renders the hook list", () => {
    listData = [hook];
    render(<Screen />);
    expect(screen.getByText("Audit Log")).toBeInTheDocument();
  });

  it("Configure NAVIGATES to the hook detail route (N4e grammar) — no dialog", async () => {
    listData = [hook];
    render(<Screen />);
    await userEvent.click(screen.getByRole("button", { name: "Konfigurovat" }));
    expect(push).toHaveBeenCalledWith("/hooks/audit-log");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("creates a hook through the create mutation", async () => {
    listData = [hook]; // non-empty so only the toolbar add button renders
    render(<Screen />);

    await userEvent.click(screen.getByText("Přidat hook"));
    await userEvent.type(screen.getByTestId(HookFormTestId.Id), "new-hook");
    await userEvent.type(screen.getByTestId(HookFormTestId.Command), "./run.sh");
    await userEvent.click(screen.getByTestId(HookFormTestId.Submit));

    expect(createMutate).toHaveBeenCalledTimes(1);
    const body = createMutate.mock.calls[0]![0].body;
    expect(body.id).toBe("new-hook");
    expect(body.command).toBe("./run.sh");
  });
});
