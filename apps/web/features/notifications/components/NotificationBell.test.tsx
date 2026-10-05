import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, renderWithProviders as render, screen } from "../../../test/render";
import { NotificationBell, NotificationBellTestId } from "./NotificationBell";

const push = vi.fn();
let open = false;
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/org",
  useSearchParams: () => new URLSearchParams(open ? "notifications=open" : ""),
}));

vi.mock("../queries", () => ({
  useNotificationsQuery: () => ({
    data: [
      { runId: "r1", title: "Broken patch", department: "dev", failedAt: "2026-10-01T00:00:00Z" },
      { runId: "r2", title: "Coloring book", failedAt: "2026-10-01T00:00:00Z" },
    ],
  }),
}));

const mutate = vi.fn();
vi.mock("../mutations", () => ({
  useMarkNotificationsReadMutation: () => ({ mutate, isPending: false }),
}));

describe("NotificationBell", () => {
  beforeEach(() => {
    push.mockReset();
    mutate.mockReset();
    open = false;
  });

  it("shows the unread count and opens the sheet via the search param", () => {
    render(<NotificationBell />);
    const trigger = screen.getByTestId(NotificationBellTestId.Trigger);
    expect(trigger).toHaveTextContent("2");
    fireEvent.click(trigger);
    expect(push).toHaveBeenCalledWith("/org?notifications=open");
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
});
