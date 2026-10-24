import type { Proposal } from "@zibby/contracts";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen, within } from "../../../test/render";
import type { BridgeWidget } from "../grid/layout";
import { ProposalsWidget, ProposalsWidgetTestId, proposalExpiryDays } from "./ProposalsWidget";
import type { BridgeWidgetProps } from "./registry";

const d = vi.hoisted(() => ({
  proposals: [] as unknown[],
  pending: false,
  mutate: vi.fn(),
  isError: false,
}));

vi.mock("../../proposals/queries", () => ({
  useProposalsQuery: () => ({
    data: d.proposals,
    isPending: d.pending,
    isError: false,
    refetch: vi.fn(),
  }),
}));
vi.mock("../../proposals/mutations", () => ({
  useDecideProposalMutation: () => ({ mutate: d.mutate, isPending: false, isError: d.isError }),
}));

const NOW = Date.parse("2026-10-24T12:00:00.000Z");
const DAY = 86_400_000;
const widget: BridgeWidget = { id: "w-p", type: "proposals", x: 0, y: 0, w: 4, h: 8 };
const setup = (over: Partial<BridgeWidgetProps> = {}): BridgeWidgetProps => ({
  widget,
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
const proposal = (id: string, over: Partial<Proposal> = {}): Proposal => ({
  id,
  source: "pattern-extract",
  text: `Text ${id}`,
  confidence: "medium",
  occurrences: 3,
  provenance: {},
  createdAt: new Date(NOW - DAY).toISOString(),
  lastSeenAt: new Date(NOW - DAY).toISOString(),
  expiresAt: new Date(NOW + 10 * DAY - 3600_000).toISOString(),
  status: "open",
  ...over,
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  d.proposals = [];
  d.pending = false;
  d.isError = false;
  d.mutate.mockReset();
});
afterEach(() => vi.useRealTimers());

describe("proposalExpiryDays", () => {
  it("rounds up and floors at zero", () => {
    expect(proposalExpiryDays(new Date(NOW + 2.2 * DAY).toISOString(), NOW)).toBe(3);
    expect(proposalExpiryDays(new Date(NOW - DAY).toISOString(), NOW)).toBe(0);
  });
});

describe("ProposalsWidget", () => {
  it("renders edited text, source, confidence and expiry", () => {
    d.proposals = [proposal("a", { editedText: "Mine", confidence: "high", source: "gap-detect" })];
    renderWithProviders(<ProposalsWidget {...setup()} />);
    expect(screen.getByText("Mine")).toBeTruthy();
    expect(screen.queryByText("Text a")).toBeNull();
    expect(screen.getByTestId(ProposalsWidgetTestId.Source).textContent).toBe(
      "Návrhy na automatizaci",
    );
    expect(screen.getByTestId(ProposalsWidgetTestId.Confidence).textContent).toBe("vysoká jistota");
    expect(screen.getByTestId(ProposalsWidgetTestId.Expiry).textContent).toBe("vyprší za 10 d");
  });

  it.each([
    [{ noteId: "patterns/suggestions" }, "/knowledge/vault?note=patterns%2Fsuggestions"],
    [{ agentId: "bob", approvalId: "ap1" }, "/workforce/agents/bob"],
    [{ approvalId: "ap1" }, "/governance/approvals"],
    [{ noteId: "n", agentId: "bob" }, "/knowledge/vault?note=n"],
  ])("links provenance %j", (provenance, href) => {
    d.proposals = [proposal("a", { provenance })];
    renderWithProviders(<ProposalsWidget {...setup()} />);
    expect(screen.getByTestId(ProposalsWidgetTestId.Provenance).getAttribute("href")).toBe(href);
  });

  it("has no provenance link when there is none", () => {
    d.proposals = [proposal("a")];
    renderWithProviders(<ProposalsWidget {...setup()} />);
    expect(screen.queryByTestId(ProposalsWidgetTestId.Provenance)).toBeNull();
  });

  it("dismisses a row", async () => {
    d.proposals = [proposal("a")];
    renderWithProviders(<ProposalsWidget {...setup()} />);
    await userEvent.click(screen.getByTestId(ProposalsWidgetTestId.Dismiss));
    expect(d.mutate).toHaveBeenCalledWith({ params: { id: "a" }, body: { action: "dismiss" } });
  });

  it("offers no Edit on an agent-factory row", () => {
    d.proposals = [proposal("a", { source: "agent-factory" })];
    renderWithProviders(<ProposalsWidget {...setup()} />);
    expect(screen.queryByTestId(ProposalsWidgetTestId.Edit)).toBeNull();
    expect(screen.getByTestId(ProposalsWidgetTestId.Dismiss)).toBeTruthy();
  });

  it("edits: prefilled editor, guarded save, cancel restores", async () => {
    d.proposals = [proposal("a", { editedText: "Mine" })];
    renderWithProviders(<ProposalsWidget {...setup()} />);
    await userEvent.click(screen.getByTestId(ProposalsWidgetTestId.Edit));
    const editor = within(screen.getByTestId(ProposalsWidgetTestId.Editor)).getByRole(
      "textbox",
    ) as HTMLTextAreaElement;
    expect(editor.value).toBe("Mine");
    const save = screen.getByTestId(ProposalsWidgetTestId.Save) as HTMLButtonElement;
    expect(save.disabled).toBe(true); // unchanged
    await userEvent.clear(editor);
    expect(save.disabled).toBe(true); // empty
    await userEvent.type(editor, "Better");
    expect(save.disabled).toBe(false);
    await userEvent.click(save);
    expect(d.mutate).toHaveBeenCalledWith(
      { params: { id: "a" }, body: { action: "edit", text: "Better" } },
      expect.anything(),
    );
    await userEvent.click(screen.getByTestId(ProposalsWidgetTestId.Cancel));
    expect(screen.queryByTestId(ProposalsWidgetTestId.Editor)).toBeNull();
    expect(screen.getByText("Mine")).toBeTruthy();
  });

  it("closes the editor only after a successful save", async () => {
    d.proposals = [proposal("a")];
    d.mutate.mockImplementation((_v: unknown, o?: { onSuccess?: () => void }) => o?.onSuccess?.());
    renderWithProviders(<ProposalsWidget {...setup()} />);
    await userEvent.click(screen.getByTestId(ProposalsWidgetTestId.Edit));
    await userEvent.type(
      within(screen.getByTestId(ProposalsWidgetTestId.Editor)).getByRole("textbox"),
      "!",
    );
    await userEvent.click(screen.getByTestId(ProposalsWidgetTestId.Save));
    expect(screen.queryByTestId(ProposalsWidgetTestId.Editor)).toBeNull();
  });

  it("shows a save error inline and keeps the typed text", async () => {
    d.proposals = [proposal("a")];
    d.isError = true;
    renderWithProviders(<ProposalsWidget {...setup()} />);
    expect(screen.getByTestId(ProposalsWidgetTestId.RowError)).toBeTruthy();
    await userEvent.click(screen.getByTestId(ProposalsWidgetTestId.Edit));
    const editor = within(screen.getByTestId(ProposalsWidgetTestId.Editor)).getByRole("textbox");
    await userEvent.type(editor, "!");
    await userEvent.click(screen.getByTestId(ProposalsWidgetTestId.Save));
    expect((editor as HTMLTextAreaElement).value).toBe("Text a!");
    expect(screen.getByTestId(ProposalsWidgetTestId.RowError)).toBeTruthy();
  });

  it("reports the count and shows the empty copy", () => {
    d.proposals = [proposal("a"), proposal("b")];
    const props = setup();
    const { unmount } = renderWithProviders(<ProposalsWidget {...props} />);
    expect(screen.getAllByTestId(ProposalsWidgetTestId.Row)).toHaveLength(2);
    expect(props.onCountChange).toHaveBeenLastCalledWith(expect.objectContaining({ count: 2 }));
    expect(props.onEmptyChange).toHaveBeenLastCalledWith(false);
    unmount();

    d.proposals = [];
    const empty = setup();
    renderWithProviders(<ProposalsWidget {...empty} />);
    expect(screen.getByTestId(ProposalsWidgetTestId.Empty).textContent).toBe(
      "Žádné návrhy ke kontrole.",
    );
    expect(empty.onEmptyChange).toHaveBeenLastCalledWith(true);
  });
});
