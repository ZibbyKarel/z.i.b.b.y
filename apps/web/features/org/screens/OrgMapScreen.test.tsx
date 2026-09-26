import { beforeEach, describe, expect, it, vi } from "vitest";
import { OrgNodeTestId } from "@zibby/design-system";
import { renderWithProviders as render, screen } from "../../../test/render";
import { OrgMapScreen, OrgMapScreenTestId } from "./OrgMapScreen";

const push = vi.fn();
/** The `?focus=` param the mocked URL reports — set per test, same pattern as
 *  `Screen.test.tsx`'s `searchTab`. */
let focusParam = "";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/org",
  useSearchParams: () => {
    const params = new URLSearchParams();
    if (focusParam) params.set("focus", focusParam);
    return params;
  },
}));

vi.mock("../../system/queries/useSystemConfigQuery", () => ({
  useSystemConfigQuery: () => ({ data: { operatorName: "Karel", companyName: "ZibbyCorp" } }),
}));

vi.mock("../../departments/queries/useDepartmentsQuery", () => ({
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

vi.mock("../../approvals/queries/useApprovalsQuery", () => ({
  useApprovalsQuery: () => ({ data: [] }),
}));

vi.mock("../../handoff/queries/useHandoffRulesQuery", () => ({
  useHandoffRulesQuery: () => ({
    data: [
      {
        id: "r1",
        from: "dev",
        signalKind: "post-merge-red",
        to: { kind: "department", id: "rel" },
        tier: 2,
        enabled: true,
      },
    ],
  }),
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

describe("OrgMapScreen", () => {
  beforeEach(() => {
    push.mockReset();
    focusParam = "";
  });

  it("renders all 11 canonical department nodes", () => {
    render(<OrgMapScreen />);
    expect(screen.getAllByTestId(OrgNodeTestId.Root)).toHaveLength(11);
  });

  it("shows the CEO and COO nodes", () => {
    render(<OrgMapScreen />);
    expect(screen.getByTestId(OrgMapScreenTestId.CeoNode)).toHaveTextContent("Karel");
    expect(screen.getByTestId(OrgMapScreenTestId.CooNode)).toHaveTextContent("Zibby");
  });

  it("shows no focus panel without ?focus=", () => {
    render(<OrgMapScreen />);
    expect(screen.queryByTestId(OrgMapScreenTestId.FocusPanel)).not.toBeInTheDocument();
  });

  it("shows the focus panel with the department's team, subtasks and handoff rows for ?focus=<id>", () => {
    focusParam = "dev";
    render(<OrgMapScreen />);
    const panel = screen.getByTestId(OrgMapScreenTestId.FocusPanel);
    expect(panel).toHaveTextContent("Kessler");
    expect(panel).toHaveTextContent("TSK-1");
    expect(panel).toHaveTextContent("post-merge-red");
  });
});
