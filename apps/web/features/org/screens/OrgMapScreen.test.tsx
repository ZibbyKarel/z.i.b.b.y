import { beforeEach, describe, expect, it, vi } from "vitest";
import { type MinionAppearance, OrgFloorplanTestId, ZibbyAvatarTestId } from "@zibby/design-system";
import { act, fireEvent, renderWithProviders as render, screen } from "../../../test/render";
import { OrgMapScreen, OrgMapScreenTestId } from "./OrgMapScreen";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/dashboard",
}));

const department = (id: string, code: string, name: string, division: string) => ({
  id,
  code,
  name,
  division,
  tagline: "",
  mandate: "",
  color: "#5b8def",
  state: "idle",
  tier2Count: 0,
  tier3Count: 0,
  errorCount: 0,
  errorRunIds: [],
});

vi.mock("../../departments/queries/useDepartmentsQuery", () => ({
  getDepartmentsQueryKey: () => ["departments"],
  useDepartmentsQuery: () => ({
    data: [
      department("dev", "DEV", "Development", "engineering"),
      department("per", "PER", "Personal Office", "office"),
    ],
  }),
}));

vi.mock("../../departments/queries/useDivisionsQuery", async () => {
  const { DIVISION_SEED } = await import("@zibby/contracts");
  return { useDivisionsQuery: () => ({ data: DIVISION_SEED }) };
});

let approvals: { id: string }[] = [];
vi.mock("../../approvals/queries/useApprovalsQuery", () => ({
  useApprovalsQuery: () => ({ data: approvals }),
}));

const APPEARANCE: MinionAppearance = {
  width: 44,
  height: 58,
  eyes: 1,
  hair: "spikes",
  hat: "beanie",
  skin: 2,
};
const kessler = {
  id: "e1",
  name: "Kessler",
  agentId: "koder",
  department: "dev",
  status: "active",
  hiredAt: "2026-01-01T00:00:00.000Z",
  state: "working",
  currentTaskTitle: "Fix the checkout test",
  position: { id: "koder", name: "Kodér", title: "Coder" },
  appearance: APPEARANCE,
};
let employeeRows: Record<string, unknown>[] = [];
vi.mock("../../employees/queries/useEmployeesQuery", () => ({
  useEmployeesQuery: () => ({ data: employeeRows }),
}));

// Spy on the floorplan's props while still rendering the real thing.
const floorplanProps = vi.hoisted(() => ({
  last: undefined as Record<string, unknown> | undefined,
}));
vi.mock("@zibby/design-system", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@zibby/design-system")>();
  return {
    ...actual,
    OrgFloorplan: (props: Record<string, unknown>) => {
      floorplanProps.last = props;
      return (actual.OrgFloorplan as (p: unknown) => unknown)(props);
    },
  };
});

vi.mock("../../departments/mutations", () => ({
  useCreateDepartmentMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));

let notifications: { runId: string; title: string; failedAt: string }[] = [];
vi.mock("../../notifications", () => ({
  NOTIFICATIONS_PARAM: "notifications",
  useNotificationsQuery: () => ({ data: notifications }),
}));

let apiDown = false;
vi.mock("../../runs/runEvents", () => ({ useApiUnreachable: () => apiDown }));

describe("OrgMapScreen", () => {
  beforeEach(() => {
    push.mockReset();
    employeeRows = [kessler];
    floorplanProps.last = undefined;
    apiDown = false;
    approvals = [];
    notifications = [{ runId: "r_fail", title: "Broken patch", failedAt: "2026-10-01T00:00:00Z" }];
  });

  it("fills the height of its parent so the floorplan can go full-bleed", () => {
    render(<OrgMapScreen />);
    expect(screen.getByTestId(OrgMapScreenTestId.Root).style.height).toBe("100%");
  });

  it("renders a room per department with an accessible name", () => {
    render(<OrgMapScreen />);
    const dev = screen.getByTestId(`${OrgFloorplanTestId.Room}-dev`);
    expect(dev).toHaveRole("button");
    expect(dev).toHaveAccessibleName("DEV · Development, 1 agent");
    expect(screen.getByTestId(`${OrgFloorplanTestId.Room}-per`)).toHaveAccessibleName(
      "PER · Personal Office, 0 agentů",
    );
  });

  it("renders a desk for each active employee, and none for an empty department", () => {
    render(<OrgMapScreen />);
    expect(screen.getByTestId(`${OrgFloorplanTestId.Desk}-e1`)).toBeInTheDocument();
    expect(screen.getByTestId(`${OrgFloorplanTestId.RoomStrip}-per`).children).toHaveLength(0);
  });

  it("navigates to the person when a desk is clicked, not to the department", () => {
    render(<OrgMapScreen />);
    fireEvent.click(screen.getByTestId(`${OrgFloorplanTestId.Desk}-e1`));
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/workforce/agents/e1");
  });

  it("navigates to the department when a room is clicked", () => {
    render(<OrgMapScreen />);
    fireEvent.click(screen.getByTestId(`${OrgFloorplanTestId.Room}-dev`));
    expect(push).toHaveBeenCalledWith("/workforce/departments/dev");
  });

  it("shows the employee's role and current task in the hover popover", () => {
    render(<OrgMapScreen />);
    fireEvent.mouseEnter(screen.getByTestId(`${OrgFloorplanTestId.Desk}-e1`));
    expect(screen.getByTestId(OrgFloorplanTestId.PopoverName)).toHaveTextContent("Kessler");
    expect(screen.getByTestId(OrgFloorplanTestId.PopoverMeta)).toHaveTextContent("DEV-01 · Coder");
    expect(screen.getByTestId(OrgFloorplanTestId.PopoverTask)).toHaveTextContent(
      "Fix the checkout test",
    );
  });

  it("puts Zibby in error with an 'api nedostupné' bubble while the API is down", () => {
    render(<OrgMapScreen />);
    expect(screen.queryByTestId(OrgFloorplanTestId.CooSpeech)).not.toBeInTheDocument();
    apiDown = true;
    render(<OrgMapScreen />);
    expect(screen.getByTestId(OrgFloorplanTestId.CooSpeech)).toHaveTextContent("api nedostupné");
    expect(screen.getAllByTestId(ZibbyAvatarTestId.Root).at(-1)).toHaveAttribute(
      "data-state",
      "error",
    );
  });

  it("shows the COO in the lobby as the Zibby avatar", () => {
    render(<OrgMapScreen />);
    const coo = screen.getByTestId(OrgFloorplanTestId.Coo);
    expect(coo).toHaveRole("button");
    expect(screen.getByTestId(ZibbyAvatarTestId.Root)).toHaveAccessibleName("Zibby · COO");
  });

  it("mirrors the worst agent state on Zibby (failed run beats working)", () => {
    render(<OrgMapScreen />);
    expect(screen.getByTestId(ZibbyAvatarTestId.Root)).toHaveAttribute("data-state", "error");
  });

  it("sends an error Zibby with no employee in error to the notification bell", () => {
    render(<OrgMapScreen />);
    fireEvent.click(screen.getByTestId(OrgFloorplanTestId.Coo));
    expect(push).toHaveBeenCalledWith("/dashboard?notifications=open");
  });

  it("sends a blocked Zibby waiting on an approval to the approvals queue", () => {
    notifications = [];
    approvals = [{ id: "a1" }];
    render(<OrgMapScreen />);
    expect(screen.getByTestId(ZibbyAvatarTestId.Root)).toHaveAttribute("data-state", "blocked");
    fireEvent.click(screen.getByTestId(OrgFloorplanTestId.Coo));
    expect(push).toHaveBeenCalledWith("/governance/approvals");
  });

  it("sends Zibby to the People roster when an employee is in its state", () => {
    notifications = [];
    render(<OrgMapScreen />);
    fireEvent.click(screen.getByTestId(OrgFloorplanTestId.Coo));
    expect(push).toHaveBeenCalledWith("/workforce/agents?state=working");
  });

  it("drops Zibby out of error once every failure is read", () => {
    notifications = [];
    render(<OrgMapScreen />);
    expect(screen.getByTestId(ZibbyAvatarTestId.Root)).not.toHaveAttribute("data-state", "error");
  });

  it("keeps the add-department button and no longer renders the old tree or focus panel", () => {
    render(<OrgMapScreen />);
    expect(screen.getByTestId(OrgMapScreenTestId.AddDepartmentButton)).toBeInTheDocument();
    expect(screen.queryByText("OTEVŘÍT ODDĚLENÍ →")).not.toBeInTheDocument();
  });

  it("passes the employee's stored appearance to its desk", () => {
    render(<OrgMapScreen />);
    const rooms = floorplanProps.last?.rooms as {
      agents: { id: string; appearance?: unknown }[];
    }[];
    expect(rooms.flatMap((r) => r.agents).find((a) => a.id === "e1")?.appearance).toEqual(
      APPEARANCE,
    );
  });

  it("shows no walkers on first load, then one when a run is handed to another department", () => {
    employeeRows = [
      { ...kessler, currentRunId: "r1" },
      { ...kessler, id: "e2", name: "Tester", department: "per" },
    ];
    const { rerender } = render(<OrgMapScreen />);
    expect(floorplanProps.last?.walkers).toEqual([]);

    employeeRows = [
      { ...kessler, currentRunId: undefined },
      { ...kessler, id: "e2", name: "Tester", department: "per", currentRunId: "r1" },
    ];
    rerender(<OrgMapScreen />);
    expect(floorplanProps.last?.walkers).toEqual([
      { id: "r1:e1->e2", agentId: "e1", toRoomId: "per", label: "Fix the checkout test" },
    ]);

    act(() => (floorplanProps.last?.onWalkerDone as (id: string) => void)("r1:e1->e2"));
    expect(floorplanProps.last?.walkers).toEqual([]);
  });
});
