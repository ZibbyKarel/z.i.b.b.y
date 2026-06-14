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
let listData: Hook[] = [];

vi.mock("./queries", () => ({
  useHooksQuery: () => ({ data: listData }),
}));

vi.mock("./mutations", () => ({
  useCreateHookMutation: () => ({ mutate: createMutate, isPending: false }),
  useUpdateHookMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteHookMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));

beforeEach(() => {
  createMutate.mockReset();
  listData = [];
});

describe("Hooks Screen", () => {
  it("renders the hook list", () => {
    listData = [hook];
    render(<Screen />);
    expect(screen.getByText("Audit Log")).toBeInTheDocument();
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
