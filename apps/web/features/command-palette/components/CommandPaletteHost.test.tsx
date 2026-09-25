import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { CommandPaletteTestId } from "@zibby/design-system";
import { renderWithProviders, screen } from "../../../test/render";

// Every domain the broadened index (ZB-12) reads is backed by its own hook —
// stub each with one fixture so the test controls exactly what comes back and
// never hits the network, mirroring `ChatSearch.test.tsx`'s pattern.
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const { hooks } = vi.hoisted(() => ({
  hooks: {
    approvals: [] as Array<{ id: string; requestedAt: string; riskType?: string }>,
    approve: vi.fn(),
    theme: "light" as "light" | "dark" | "system",
    setTheme: vi.fn(),
  },
}));

vi.mock("../../approvals", () => ({
  useApprovalsQuery: () => ({ data: hooks.approvals }),
  useApproveMutation: () => ({ mutate: hooks.approve }),
}));
vi.mock("../../../state/appearance", () => ({
  useAppearance: () => ({ theme: hooks.theme, setTheme: hooks.setTheme }),
}));
vi.mock("../../departments/queries", () => ({
  useDepartmentsQuery: () => ({ data: [{ id: "dev", name: "Development" }] }),
}));
vi.mock("../../employees/queries", () => ({
  useEmployeesQuery: () => ({ data: [{ id: "alice", name: "Alice", department: "dev" }] }),
}));
vi.mock("../../tasks/queries", () => ({
  useTaskParentsInfiniteQuery: () => ({ data: [] }),
}));
vi.mock("../../chains/queries", () => ({ useChainsQuery: () => ({ data: [] }) }));
vi.mock("../../goals/queries", () => ({ useGoalsQuery: () => ({ data: [] }) }));
vi.mock("../../companies/queries", () => ({ useCompaniesQuery: () => ({ data: [] }) }));
vi.mock("../../teams/queries", () => ({ useTeamsQuery: () => ({ data: [] }) }));
vi.mock("../../projects/queries", () => ({ useProjectsQuery: () => ({ data: [] }) }));
vi.mock("../../pipelines/queries", () => ({ usePipelinesQuery: () => ({ data: [] }) }));
vi.mock("../../skills/queries", () => ({ useSkillsQuery: () => ({ data: [] }) }));
vi.mock("../../mcp/queries", () => ({ useMcpServersQuery: () => ({ data: [] }) }));
vi.mock("../../hooks/queries", () => ({ useHooksQuery: () => ({ data: [] }) }));
vi.mock("../../commands/queries", () => ({ useCommandsQuery: () => ({ data: [] }) }));
vi.mock("../../automations/queries", () => ({ useAutomationsQuery: () => ({ data: [] }) }));
vi.mock("../../handoff/queries", () => ({ useSignalKindsQuery: () => ({ data: [] }) }));
vi.mock("../../knowledge/queries", () => ({
  useMemorySearchQuery: () => ({ data: undefined, isFetching: false }),
}));

import { CommandPaletteHost } from "./CommandPaletteHost";

function Harness(props: Partial<Parameters<typeof CommandPaletteHost>[0]> = {}) {
  return (
    <CommandPaletteHost onOpenApproval={vi.fn()} onOpenChange={vi.fn()} open={false} {...props} />
  );
}

describe("CommandPaletteHost", () => {
  beforeEach(() => {
    hooks.approve.mockClear();
    hooks.setTheme.mockClear();
    push.mockClear();
  });

  it("renders nothing while closed", () => {
    renderWithProviders(<Harness open={false} />);
    expect(screen.queryByTestId(CommandPaletteTestId.Root)).not.toBeInTheDocument();
  });

  it("lists the live index once open, including a department and a person", () => {
    renderWithProviders(<Harness open />);
    expect(screen.getByTestId(CommandPaletteTestId.Root)).toBeInTheDocument();
    expect(screen.getByTestId(`${CommandPaletteTestId.Item}-dev`)).toBeInTheDocument();
    expect(screen.getByTestId(`${CommandPaletteTestId.Item}-alice`)).toBeInTheDocument();
    expect(screen.getByTestId(`${CommandPaletteTestId.Item}-new-task`)).toBeInTheDocument();
  });

  it("filters the list as the operator types", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness open />);

    await user.type(screen.getByTestId(CommandPaletteTestId.Input), "alice");

    expect(screen.getByTestId(`${CommandPaletteTestId.Item}-alice`)).toBeInTheDocument();
    expect(screen.queryByTestId(`${CommandPaletteTestId.Item}-dev`)).not.toBeInTheDocument();
  });

  it("picking a department navigates to its team tab and closes the palette", async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<Harness open onOpenChange={onOpenChange} />);

    await user.click(screen.getByTestId(`${CommandPaletteTestId.Item}-dev`));

    expect(push).toHaveBeenCalledWith("/org/departments/dev/team");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("'New task' navigates to the new-task page", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness open />);

    await user.click(screen.getByTestId(`${CommandPaletteTestId.Item}-new-task`));

    expect(push).toHaveBeenCalledWith("/work/tasks/new");
  });

  it("'Toggle theme' flips light/dark via the live appearance setter", async () => {
    hooks.theme = "light";
    const user = userEvent.setup();
    renderWithProviders(<Harness open />);

    await user.click(screen.getByTestId(`${CommandPaletteTestId.Item}-toggle-theme`));

    expect(hooks.setTheme).toHaveBeenCalledWith("dark");
  });

  it("hides 'Approve next' when nothing is pending", () => {
    hooks.approvals = [];
    renderWithProviders(<Harness open />);
    expect(
      screen.queryByTestId(`${CommandPaletteTestId.Item}-approve-next`),
    ).not.toBeInTheDocument();
  });

  it("'Approve next' quick-approves the oldest non-high-risk pending approval", async () => {
    hooks.approvals = [
      { id: "newer", requestedAt: "2026-09-25T10:00:00.000Z" },
      { id: "older", requestedAt: "2026-09-25T08:00:00.000Z" },
    ];
    const user = userEvent.setup();
    renderWithProviders(<Harness open />);

    await user.click(screen.getByTestId(`${CommandPaletteTestId.Item}-approve-next`));

    expect(hooks.approve).toHaveBeenCalledWith({ params: { id: "older" }, body: {} });
  });

  it("'Approve next' opens the approval sheet instead of quick-approving a high-risk pick", async () => {
    hooks.approvals = [
      { id: "risky", requestedAt: "2026-09-25T08:00:00.000Z", riskType: "platba" },
    ];
    const onOpenApproval = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<Harness open onOpenApproval={onOpenApproval} />);

    await user.click(screen.getByTestId(`${CommandPaletteTestId.Item}-approve-next`));

    expect(onOpenApproval).toHaveBeenCalledWith("risky");
    expect(hooks.approve).not.toHaveBeenCalled();
  });
});
