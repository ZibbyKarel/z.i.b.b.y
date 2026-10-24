import { beforeEach, describe, expect, it, vi } from "vitest";
import { ButtonTestId } from "@zibby/design-system";
import { fireEvent, renderWithProviders as render, screen, within } from "../../../test/render";
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
let analyzeVariables: { params: { projectId: string } } | undefined;
let analyzePending = false;
vi.mock("../../project-health/mutations", () => ({
  useAnalyzeProjectHealthMutation: () => ({
    mutate: analyze,
    isPending: analyzePending,
    variables: analyzeVariables,
  }),
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
    analyzePending = false;
    analyzeVariables = undefined;
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
    expect(within(rows[0]!).getByTestId(NotificationBellTestId.HealthLink)).toHaveAttribute(
      "href",
      "/projects/p1",
    );
    expect(within(rows[0]!).queryByTestId(NotificationBellTestId.MarkRead)).not.toBeInTheDocument();
  });

  it("analyzes the down project", () => {
    open = true;
    health = [downStatus];
    render(<NotificationBell />);
    fireEvent.click(screen.getByTestId(NotificationBellTestId.HealthAnalyze));
    expect(analyze).toHaveBeenCalledWith(
      { params: { projectId: "p1" }, body: {} },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    );
  });

  it("is a ghost trigger without count when nothing is wrong", () => {
    notifications = [];
    render(<NotificationBell />);
    const trigger = screen.getByTestId(NotificationBellTestId.Trigger);
    expect(trigger).not.toHaveTextContent(/\d/);
  });

  it("uses danger intent and a mixed-count accessible name when something is wrong", () => {
    health = [downStatus];
    render(<NotificationBell />);
    const trigger = screen.getByTestId(NotificationBellTestId.Trigger);
    expect(trigger).toHaveAccessibleName("Notifikace (3)");
    expect(within(trigger).getByTestId(ButtonTestId.Dot)).toBeInTheDocument();
  });

  it("uses ghost intent (no danger dot) when nothing is wrong", () => {
    notifications = [];
    render(<NotificationBell />);
    const trigger = screen.getByTestId(NotificationBellTestId.Trigger);
    expect(trigger).toHaveAccessibleName("Notifikace (0)");
    expect(within(trigger).queryByTestId(ButtonTestId.Dot)).not.toBeInTheDocument();
  });

  it("falls back to the project id when the project is not in the list", () => {
    open = true;
    notifications = [];
    health = [{ ...downStatus, projectId: "p2" }];
    render(<NotificationBell />);
    expect(screen.getByTestId(NotificationBellTestId.HealthItem)).toHaveTextContent(
      /p2 — nedostupné od/,
    );
  });

  it("with only health rows: no empty state and no mark-all footer", () => {
    open = true;
    notifications = [];
    health = [downStatus];
    render(<NotificationBell />);
    expect(screen.getAllByTestId(NotificationBellTestId.HealthItem)).toHaveLength(1);
    expect(screen.queryByText("Vše přečteno")).not.toBeInTheDocument();
    expect(screen.queryByTestId(NotificationBellTestId.MarkAllRead)).not.toBeInTheDocument();
  });

  it("with runs and health rows, mark-all still sends an empty body", () => {
    open = true;
    health = [downStatus];
    render(<NotificationBell />);
    fireEvent.click(screen.getByTestId(NotificationBellTestId.MarkAllRead));
    expect(mutate).toHaveBeenCalledWith({ body: {} });
  });

  it("shows the server's message inline on the row when Analyze fails", () => {
    open = true;
    health = [downStatus];
    analyze.mockImplementation((_v, opts) =>
      opts.onError({ status: 409, body: { message: "Analysis already running" } }),
    );
    render(<NotificationBell />);
    fireEvent.click(screen.getByTestId(NotificationBellTestId.HealthAnalyze));
    const row = screen.getByTestId(NotificationBellTestId.HealthItem);
    expect(within(row).getByRole("alert")).toHaveTextContent("Analysis already running");
  });

  it("falls back to generic copy without a server message, and clears it on retry", () => {
    open = true;
    health = [downStatus];
    analyze.mockImplementationOnce((_v, opts) => opts.onError(new Error("network")));
    render(<NotificationBell />);
    fireEvent.click(screen.getByTestId(NotificationBellTestId.HealthAnalyze));
    expect(screen.getByRole("alert")).toHaveTextContent("Akce se nezdařila.");
    analyze.mockImplementationOnce(() => undefined);
    fireEvent.click(screen.getByTestId(NotificationBellTestId.HealthAnalyze));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("links the row to the started task on success", () => {
    open = true;
    health = [downStatus];
    analyze.mockImplementation((_v, opts) =>
      opts.onSuccess({ status: 200, body: { taskId: "t9" } }),
    );
    render(<NotificationBell />);
    fireEvent.click(screen.getByTestId(NotificationBellTestId.HealthAnalyze));
    const link = screen.getByTestId(NotificationBellTestId.HealthTaskLink);
    expect(link).toHaveAttribute("href", "/work/tasks/t9");
    expect(link).toHaveTextContent("Analýza spuštěna");
    expect(screen.getByTestId(NotificationBellTestId.HealthAnalyze)).toHaveTextContent(
      "Analyzovat znovu",
    );
  });

  it("disables Analyze only on the row being analyzed", () => {
    open = true;
    health = [downStatus, { ...downStatus, projectId: "p2" }];
    analyzePending = true;
    analyzeVariables = { params: { projectId: "p2" } };
    render(<NotificationBell />);
    const [first, second] = screen.getAllByTestId(NotificationBellTestId.HealthAnalyze);
    expect(first).toBeEnabled();
    expect(second).toBeDisabled();
  });
});
