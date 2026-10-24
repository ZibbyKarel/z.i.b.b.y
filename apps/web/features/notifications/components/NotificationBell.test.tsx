import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, renderWithProviders as render, screen } from "../../../test/render";
import { NotificationBell, NotificationBellTestId } from "./NotificationBell";

const push = vi.fn();
let open = false;
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/dashboard",
  useSearchParams: () => new URLSearchParams(open ? "notifications=open" : ""),
}));

const runs = [
  { runId: "r1", title: "Broken patch", department: "dev", failedAt: "2026-10-01T00:00:00Z" },
  { runId: "r2", title: "Coloring book", failedAt: "2026-10-01T00:00:00Z" },
];
let notifications = runs;
vi.mock("../queries", () => ({
  useNotificationsQuery: () => ({ data: notifications }),
}));

let health: Array<Record<string, unknown>> = [];
vi.mock("../../project-health/queries", () => ({
  useProjectHealthQuery: () => ({ data: health }),
}));

const analyze = vi.fn();
vi.mock("../../project-health/mutations", () => ({
  useAnalyzeProjectHealthMutation: () => ({ mutate: analyze, isPending: false }),
}));

vi.mock("../../projects/queries", () => ({
  useProjectsQuery: () => ({ data: [{ id: "p1", name: "Shop" }] }),
}));

const downStatus = {
  projectId: "p1",
  url: "https://x.test/health",
  state: "down",
  sinceAt: "2026-10-01T00:00:00Z",
  checkedAt: "2026-10-01T00:05:00Z",
};

const mutate = vi.fn();
vi.mock("../mutations", () => ({
  useMarkNotificationsReadMutation: () => ({ mutate, isPending: false }),
}));

describe("NotificationBell", () => {
  beforeEach(() => {
    push.mockReset();
    mutate.mockReset();
    analyze.mockReset();
    open = false;
    notifications = runs;
    health = [];
  });

  it("shows the unread count and opens the sheet via the search param", () => {
    render(<NotificationBell />);
    const trigger = screen.getByTestId(NotificationBellTestId.Trigger);
    expect(trigger).toHaveTextContent("2");
    fireEvent.click(trigger);
    expect(push).toHaveBeenCalledWith("/dashboard?notifications=open");
  });

  it("marks one failure read, or all of them", () => {
    open = true;
    render(<NotificationBell />);
    expect(screen.getAllByTestId(NotificationBellTestId.Item)).toHaveLength(2);
    fireEvent.click(screen.getAllByTestId(NotificationBellTestId.MarkRead)[0]!);
    expect(mutate).toHaveBeenCalledWith({ body: { runIds: ["r1"] } });
    fireEvent.click(screen.getByTestId(NotificationBellTestId.MarkAllRead));
    expect(mutate).toHaveBeenCalledWith({ body: {} });
  });

  it("counts down projects in the trigger and lists them with project link", () => {
    open = true;
    health = [downStatus, { ...downStatus, projectId: "p2", state: "up" }];
    render(<NotificationBell />);
    expect(screen.getByTestId(NotificationBellTestId.Trigger)).toHaveTextContent("3");
    const rows = screen.getAllByTestId(NotificationBellTestId.HealthItem);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent(/Shop — nedostupné od/);
    expect(rows[0]!.querySelector("a")).toHaveAttribute("href", "/projects/p1");
    expect(rows[0]!.querySelector(`[data-testid="${NotificationBellTestId.MarkRead}"]`)).toBeNull();
  });

  it("analyzes the down project", () => {
    open = true;
    health = [downStatus];
    render(<NotificationBell />);
    fireEvent.click(screen.getByTestId(NotificationBellTestId.HealthAnalyze));
    expect(analyze).toHaveBeenCalledWith({ params: { projectId: "p1" }, body: {} });
  });

  it("is a ghost trigger without count when nothing is wrong", () => {
    notifications = [];
    render(<NotificationBell />);
    const trigger = screen.getByTestId(NotificationBellTestId.Trigger);
    expect(trigger).not.toHaveTextContent(/\d/);
  });
});
