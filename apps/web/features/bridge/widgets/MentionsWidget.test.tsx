import { BoardRowTestId } from "@zibby/design-system";
import userEvent from "@testing-library/user-event";
import { type MockInstance, beforeEach, describe, expect, it, vi } from "vitest";
import { LoadErrorTestId } from "../../../components/LoadError/LoadError";
import { renderWithProviders, screen, within } from "../../../test/render";
import type { BridgeWidget } from "../grid/layout";
import { MentionsWidget, MentionsWidgetTestId } from "./MentionsWidget";
import type { BridgeWidgetProps } from "./registry";

const d = vi.hoisted(() => ({ items: [] as unknown[], pending: false, error: false }));

vi.mock("../../integrations/queries", () => ({
  useChannelItemsQuery: () => ({
    data: d.items,
    isPending: d.pending,
    isError: d.error,
    refetch: vi.fn(),
  }),
}));

const widget: BridgeWidget = { id: "w-m", type: "mentions", x: 0, y: 0, w: 4, h: 8 };
const setup = (): BridgeWidgetProps => ({
  widget,
  editing: false,
  onEmptyChange: vi.fn(),
  onCountChange: vi.fn(),
  selection: null,
  onOpen: vi.fn(),
  epicClosed: {},
  onEpicToggle: vi.fn(),
  onScopeChange: vi.fn(),
});

const ago = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
const item = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  integrationId: "int-1",
  kind: "jira",
  externalRef: {},
  from: "Alice",
  text: `text ${id}`,
  state: "triaged",
  raw: {},
  url: `https://x/${id}`,
  receivedAt: ago(1),
  ...over,
});

let openSpy: MockInstance<typeof window.open>;
beforeEach(() => {
  d.items = [];
  d.pending = false;
  d.error = false;
  openSpy = vi.spyOn(window, "open").mockReturnValue(null);
});

describe("MentionsWidget", () => {
  it("lists conversational sources newest first", () => {
    d.items = [
      item("jira", { kind: "jira", receivedAt: ago(3) }),
      item("slack", { kind: "slack", receivedAt: ago(1) }),
      item("github", { kind: "github", receivedAt: ago(2) }),
      item("email", { kind: "email", receivedAt: ago(4) }),
      item("calendar", { kind: "calendar", receivedAt: ago(0.5) }),
      item("sentry", { kind: "sentry", receivedAt: ago(0.2) }),
    ];
    const props = setup();
    renderWithProviders(<MentionsWidget {...props} />);
    expect(screen.getAllByTestId(BoardRowTestId.Root)).toHaveLength(4);
    expect(screen.getAllByTestId(MentionsWidgetTestId.Snippet).map((e) => e.textContent)).toEqual([
      "text slack",
      "text github",
      "text jira",
      "text email",
    ]);
    expect(props.onCountChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ count: 4, you: 0 }),
    );
  });

  it("drops dismissed items", () => {
    d.items = [item("a", { state: "ignored" }), item("b", { state: "new" })];
    renderWithProviders(<MentionsWidget {...setup()} />);
    expect(screen.getAllByTestId(BoardRowTestId.Root)).toHaveLength(1);
  });

  it("opens the source in a new tab", async () => {
    d.items = [item("a")];
    renderWithProviders(<MentionsWidget {...setup()} />);
    await userEvent.setup().click(screen.getByTestId(BoardRowTestId.Root));
    expect(openSpy).toHaveBeenCalledWith("https://x/a", "_blank", "noopener,noreferrer");
  });

  it("a row without url is not clickable", async () => {
    d.items = [item("a", { url: undefined })];
    renderWithProviders(<MentionsWidget {...setup()} />);
    const row = screen.getByTestId(BoardRowTestId.Root);
    expect(row).not.toHaveRole("button");
    await userEvent.setup().click(row);
    expect(openSpy).not.toHaveBeenCalled();
  });

  it("a row without author shows only the snippet", () => {
    d.items = [item("a", { from: undefined })];
    renderWithProviders(<MentionsWidget {...setup()} />);
    expect(screen.queryByTestId(MentionsWidgetTestId.Author)).toBeNull();
    expect(
      within(screen.getByTestId(BoardRowTestId.Root)).getByTestId(MentionsWidgetTestId.Snippet),
    ).toHaveTextContent("text a");
  });

  it("caps at 50 rows", () => {
    d.items = Array.from({ length: 60 }, (_, n) => item(`i${n}`, { receivedAt: ago(n + 1) }));
    renderWithProviders(<MentionsWidget {...setup()} />);
    expect(screen.getAllByTestId(BoardRowTestId.Root)).toHaveLength(50);
    expect(screen.getByText("text i0")).toBeInTheDocument();
  });

  it("reports empty when nothing matches, never while loading", () => {
    const props = setup();
    const { unmount } = renderWithProviders(<MentionsWidget {...props} />);
    expect(props.onEmptyChange).toHaveBeenLastCalledWith(true);
    unmount();

    d.pending = true;
    const loading = setup();
    renderWithProviders(<MentionsWidget {...loading} />);
    expect(loading.onEmptyChange).not.toHaveBeenCalledWith(true);
  });

  it("shows the load error and does not collapse", () => {
    d.error = true;
    const props = setup();
    renderWithProviders(<MentionsWidget {...props} />);
    expect(screen.getByTestId(LoadErrorTestId.Root)).toBeInTheDocument();
    expect(props.onEmptyChange).not.toHaveBeenCalledWith(true);
  });
});
