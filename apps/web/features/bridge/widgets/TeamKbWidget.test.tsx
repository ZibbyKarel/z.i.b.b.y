import { LoadErrorTestId } from "../../../components/LoadError/LoadError";
import { DropdownTestId } from "@zibby/design-system";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen, within } from "../../../test/render";
import type { BridgeWidget } from "../grid/layout";
import type { BridgeWidgetProps } from "./registry";
import { TeamKbWidget, TeamKbWidgetTestId } from "./TeamKbWidget";

const d = vi.hoisted(() => ({
  teams: [] as { id: string; name: string }[],
  digest: undefined as unknown,
  error: null as unknown,
  pending: false,
}));

vi.mock("../../teams/queries", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../teams/queries")>()),
  useTeamsQuery: () => ({ data: d.teams }),
  useTeamKbDigestQuery: () => ({
    data: d.digest,
    error: d.error,
    isError: d.error !== null,
    isPending: d.pending,
    refetch: vi.fn(),
  }),
}));

const widget = (scope?: BridgeWidget["scope"]): BridgeWidget => ({
  id: "w-kb",
  type: "teamKb",
  x: 0,
  y: 0,
  w: 4,
  h: 8,
  scope,
});
const setup = (over: Partial<BridgeWidgetProps> = {}): BridgeWidgetProps => ({
  widget: widget({ teamId: "devrel" }),
  editing: false,
  onEmptyChange: vi.fn(),
  onCountChange: vi.fn(),
  selection: null,
  onOpen: vi.fn(),
  epicClosed: {},
  onEpicToggle: vi.fn(),
  onScopeChange: vi.fn(),
  ...over,
});

beforeEach(() => {
  d.teams = [
    { id: "devrel", name: "DevRel" },
    { id: "sales", name: "Sales" },
  ];
  d.digest = undefined;
  d.error = null;
  d.pending = false;
});

describe("TeamKbWidget", () => {
  it("without a scope shows the pick copy and reports empty outside edit mode", () => {
    const props = setup({ widget: widget() });
    renderWithProviders(<TeamKbWidget {...props} />);
    expect(screen.getByTestId(TeamKbWidgetTestId.Pick)).toHaveTextContent(
      "Vyber tým v režimu úprav.",
    );
    expect(props.onEmptyChange).toHaveBeenLastCalledWith(true);
  });

  it("in edit mode lists teams and choosing one calls onScopeChange", async () => {
    const props = setup({ widget: widget(), editing: true });
    renderWithProviders(<TeamKbWidget {...props} />);
    const select = screen.getByTestId(TeamKbWidgetTestId.TeamSelect);
    await userEvent.click(within(select).getByTestId(DropdownTestId.Trigger));
    const options = screen.getAllByTestId(DropdownTestId.Option);
    expect(options.map((o) => o.textContent)).toEqual(["DevRel", "Sales"]);
    await userEvent.click(options[1] as HTMLElement);
    expect(props.onScopeChange).toHaveBeenCalledWith({ teamId: "sales" });
  });

  it("a 404 digest shows the no-KB copy", () => {
    d.error = { status: 404 };
    renderWithProviders(<TeamKbWidget {...setup()} />);
    expect(screen.getByTestId(TeamKbWidgetTestId.NoKb)).toHaveTextContent(
      "Tým nemá znalostní bázi.",
    );
  });

  it("a non-404 error shows the error state and does not report empty", () => {
    d.error = { status: 500 };
    const props = setup();
    renderWithProviders(<TeamKbWidget {...props} />);
    expect(screen.getByTestId(LoadErrorTestId.Root)).toBeInTheDocument();
    expect(screen.queryByTestId(TeamKbWidgetTestId.NoKb)).not.toBeInTheDocument();
    expect(props.onEmptyChange).toHaveBeenLastCalledWith(false);
  });

  it("renders questions and agreements as rows that open the note sheet, with count and team name in the header", async () => {
    d.digest = {
      questions: [
        { text: "Q1", noteId: "meetings/a b.md", noteTitle: "Sync A", date: "2026-10-01" },
        { text: "Q2", noteId: "meetings/c.md", noteTitle: "Sync C" },
      ],
      decisions: [{ text: "D1", noteId: "meetings/a b.md", noteTitle: "Sync A" }],
    };
    const props = setup();
    renderWithProviders(<TeamKbWidget {...props} />);
    expect(
      within(screen.getByTestId(TeamKbWidgetTestId.Questions)).getAllByTestId(
        TeamKbWidgetTestId.Row,
      ),
    ).toHaveLength(2);
    expect(
      within(screen.getByTestId(TeamKbWidgetTestId.Decisions)).getAllByTestId(
        TeamKbWidgetTestId.Row,
      ),
    ).toHaveLength(1);
    const rows = screen.getAllByTestId(TeamKbWidgetTestId.Row);
    expect(rows).toHaveLength(3);
    await userEvent.click(rows[2]!);
    expect(props.onOpen).toHaveBeenCalledWith({
      kind: "note",
      id: "devrel:meetings/a b.md",
      widgetId: "w-kb",
      key: "w-kb:decisions:0",
    });
    expect(props.onCountChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ count: 3, aside: "DevRel" }),
    );
    expect(props.onEmptyChange).toHaveBeenLastCalledWith(false);
    expect(screen.queryByTestId(TeamKbWidgetTestId.TeamSelect)).not.toBeInTheDocument();
    expect(screen.getByText("Otevřené otázky")).toBeInTheDocument();
    expect(screen.getByText("Dohody")).toBeInTheDocument();
  });
});
