import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AgentGlyphTestId,
  DropdownTestId,
  OrgConnectorTestId,
  OrgNodeTestId,
  ZibbyAvatarTestId,
} from "@zibby/design-system";
import { fireEvent, renderWithProviders as render, screen, within } from "../../../test/render";
import { OrgMapScreen, OrgMapScreenTestId } from "./OrgMapScreen";

const push = vi.fn();
/** The `?department=` param the mocked URL reports — set per test, same pattern as
 *  `Screen.test.tsx`'s `searchTab`. */
let focusParam = "";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/org",
  useSearchParams: () => {
    const params = new URLSearchParams();
    if (focusParam) params.set("department", focusParam);
    return params;
  },
}));

vi.mock("../../departments/queries/useDepartmentsQuery", () => ({
  getDepartmentsQueryKey: () => ["departments"],
  useDepartmentsQuery: () => ({
    data: [
      {
        id: "dev",
        code: "DEV",
        name: "Development",
        tagline: "",
        mandate: "",
        color: "#5b8def",
        state: "idle",
        tier2Count: 0,
        tier3Count: 0,
        errorCount: 1,
      },
    ],
  }),
}));

vi.mock("../../departments/queries/useDivisionsQuery", async () => {
  const { DIVISION_SEED } = await import("@zibby/contracts");
  return { useDivisionsQuery: () => ({ data: DIVISION_SEED }) };
});

vi.mock("../../departments/useDepartmentLookup", async () => {
  const { DEPARTMENTS } = await import("@zibby/contracts");
  const { departmentLookup } = await import("../../departments/departmentLookup");
  return { useDepartmentLookup: () => departmentLookup(DEPARTMENTS) };
});

vi.mock("../../approvals/queries/useApprovalsQuery", () => ({
  useApprovalsQuery: () => ({ data: [] }),
}));

vi.mock("../../employees/queries/useEmployeesQuery", () => ({
  useEmployeesQuery: () => ({
    data: [
      {
        id: "e1",
        name: "Kessler",
        agentId: "koder",
        department: "dev",
        status: "active",
        hiredAt: "2026-01-01T00:00:00.000Z",
        state: "working",
        position: { id: "koder", name: "Kodér", title: "Coder" },
      },
    ],
  }),
}));

vi.mock("../../departments/queries/useDepartmentSubtasksQuery", () => ({
  useDepartmentSubtasksQuery: () => ({ data: [{ taskId: "TSK-1", state: "working" }] }),
}));

vi.mock("../../agents", () => ({
  useAgentsQuery: () => ({
    data: [
      { id: "koder", name: "Kodér" },
      { id: "tester", name: "Tester" },
    ],
  }),
}));

const hireMutate = vi.fn();
vi.mock("../../employees/mutations", () => ({
  useHireEmployeeMutation: () => ({ mutate: hireMutate, isPending: false }),
}));

describe("OrgMapScreen", () => {
  beforeEach(() => {
    push.mockReset();
    hireMutate.mockReset();
    focusParam = "";
  });

  it("renders all 11 canonical department nodes", () => {
    render(<OrgMapScreen />);
    expect(screen.getAllByTestId(OrgNodeTestId.Root)).toHaveLength(11);
  });

  it("shows the COO as the Zibby avatar", () => {
    render(<OrgMapScreen />);
    const avatar = within(screen.getByTestId(OrgMapScreenTestId.CooNode)).getByTestId(
      ZibbyAvatarTestId.Root,
    );
    expect(avatar).toHaveRole("img");
    expect(avatar).toHaveAccessibleName("Zibby · COO");
  });

  it("shows no focus panel without ?department=", () => {
    render(<OrgMapScreen />);
    expect(screen.queryByTestId(OrgMapScreenTestId.FocusPanel)).not.toBeInTheDocument();
  });

  it("shows the focus panel with the department's team and subtasks for ?department=<id>", () => {
    focusParam = "dev";
    render(<OrgMapScreen />);
    const panel = screen.getByTestId(OrgMapScreenTestId.FocusPanel);
    expect(panel).toHaveTextContent("Kessler");
    expect(panel).toHaveTextContent("TSK-1");
  });

  it("groups the departments under the four divisions", () => {
    render(<OrgMapScreen />);
    const divisions = screen.getAllByTestId(OrgMapScreenTestId.Division);
    expect(divisions).toHaveLength(4);
    expect(divisions[0]).toHaveTextContent("Engineering");
  });

  it("joins the COO trunk, the division bus, each division and each node with a connector", () => {
    render(<OrgMapScreen />);
    // 1 COO trunk + 1 bus + 1 drop per division + 1 drop per department node.
    expect(screen.getAllByTestId(OrgConnectorTestId.Root)).toHaveLength(2 + 4 + 11);
  });

  it("turns only the focused department's drop connector --ink", () => {
    focusParam = "dev";
    render(<OrgMapScreen />);
    const active = screen
      .getAllByTestId(OrgConnectorTestId.Root)
      .filter((el) => el.className.includes("bg-ink"));
    expect(active).toHaveLength(1);
  });

  it("renders no AgentGlyph with no focus panel open — the COO is the Zibby avatar", () => {
    render(<OrgMapScreen />);
    expect(screen.queryAllByTestId(AgentGlyphTestId.Root)).toHaveLength(0);
  });

  it("renders an AgentGlyph for each focus-panel team tile", () => {
    focusParam = "dev";
    render(<OrgMapScreen />);
    expect(screen.getAllByTestId(AgentGlyphTestId.Root)).toHaveLength(1);
  });

  it("links each team tile to its agent's registry detail", () => {
    focusParam = "dev";
    render(<OrgMapScreen />);
    expect(screen.getByTestId(OrgMapScreenTestId.TeamTile)).toHaveAttribute(
      "href",
      "/system/registries/positions/koder",
    );
  });

  it("puts the clicked department into the ?department= param", () => {
    render(<OrgMapScreen />);
    fireEvent.click(screen.getAllByTestId(OrgNodeTestId.Root)[0]!);
    expect(push).toHaveBeenCalledWith("/org?department=dev");
  });

  it("offers only agents no department holds yet, and hires the picked one into the focus department", () => {
    focusParam = "dev";
    render(<OrgMapScreen />);
    fireEvent.click(screen.getByTestId(DropdownTestId.Trigger));
    const options = screen.getAllByTestId(DropdownTestId.Option);
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveTextContent("Tester");
    fireEvent.click(options[0]!);
    fireEvent.click(screen.getByTestId(OrgMapScreenTestId.AddEmployeeButton));
    expect(hireMutate).toHaveBeenCalledWith(
      { params: { id: "dev" }, body: { agentId: "tester" } },
      expect.anything(),
    );
  });
});
