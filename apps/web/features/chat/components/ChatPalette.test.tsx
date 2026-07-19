import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { SearchMenuTestId } from "@zibby/design-system";
import { renderWithProviders, screen } from "../../../test/render";

// Every section is backed by its own hook — stub each so the palette's tests
// control exactly what comes back and never hit the network.
vi.mock("../../agents/queries/useAgentsQuery", () => ({
  useAgentsQuery: () => ({
    data: [
      { id: "builder", name: "Builder", glyph: "hammer" },
      { id: "koder", name: "Kodér" },
    ],
    isPending: false,
  }),
  getAgentsQueryKey: () => ["agents"],
}));
vi.mock("../../pipelines/queries/usePipelinesQuery", () => ({
  usePipelinesQuery: () => ({ data: [{ id: "delivery", name: "Delivery" }], isPending: false }),
  getPipelinesQueryKey: () => ["pipelines"],
}));
vi.mock("../../approvals/queries/useApprovalsQuery", () => ({
  useApprovalsQuery: () => ({
    data: [
      {
        id: "ap1",
        runId: "r1",
        kind: "agent",
        skill: "writer",
        action: "purchase",
        detail: "buy the domain",
        risk: "low",
        status: "pending",
        requestedAt: "2026-06-12T07:00:00.000Z",
      },
    ],
    isPending: false,
  }),
  getApprovalsQueryKey: () => ["approvals"],
}));
vi.mock("../../memory/queries/useMemorySearchQuery", () => ({
  useMemorySearchQuery: (q: string) => ({
    data: q.trim()
      ? { results: [{ id: "note1", title: "Roadmap", tier: "knowledge", snippet: "…" }] }
      : undefined,
    isFetching: false,
  }),
  getMemorySearchQueryKey: (q: string) => ["memory", "search", q],
}));

import { ChatPalette, ChatPaletteTestId } from "./ChatPalette";

describe("ChatPalette (14.5)", () => {
  it("renders the search input and stays closed to results until a query is typed", () => {
    renderWithProviders(
      <ChatPalette
        briefingPending={false}
        onClose={vi.fn()}
        onDetailSelect={vi.fn()}
        onGenerateBriefing={vi.fn()}
        onNavigate={vi.fn()}
      />,
    );
    expect(screen.getByTestId(ChatPaletteTestId.Root)).toBeInTheDocument();
    expect(screen.queryByTestId(`${SearchMenuTestId.Item}-agents-builder`)).not.toBeInTheDocument();
  });

  it("filters agents, pipelines and gates by the typed query", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ChatPalette
        briefingPending={false}
        onClose={vi.fn()}
        onDetailSelect={vi.fn()}
        onGenerateBriefing={vi.fn()}
        onNavigate={vi.fn()}
      />,
    );
    await user.type(screen.getByTestId(SearchMenuTestId.Input), "Bui");
    expect(screen.getByTestId(`${SearchMenuTestId.Item}-agents-builder`)).toBeInTheDocument();
    expect(screen.queryByTestId(`${SearchMenuTestId.Item}-agents-koder`)).not.toBeInTheDocument();
    expect(
      screen.queryByTestId(`${SearchMenuTestId.Item}-pipelines-delivery`),
    ).not.toBeInTheDocument();
  });

  it("selecting an agent hands its full record to onDetailSelect and closes the palette", async () => {
    const onDetailSelect = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <ChatPalette
        briefingPending={false}
        onClose={onClose}
        onDetailSelect={onDetailSelect}
        onGenerateBriefing={vi.fn()}
        onNavigate={vi.fn()}
      />,
    );
    await user.type(screen.getByTestId(SearchMenuTestId.Input), "Bui");
    await user.click(screen.getByTestId(`${SearchMenuTestId.Item}-agents-builder`));

    expect(onDetailSelect).toHaveBeenCalledWith({
      kind: "agent",
      agent: { id: "builder", name: "Builder", glyph: "hammer" },
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("selecting a pipeline hands its full record to onDetailSelect", async () => {
    const onDetailSelect = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <ChatPalette
        briefingPending={false}
        onClose={vi.fn()}
        onDetailSelect={onDetailSelect}
        onGenerateBriefing={vi.fn()}
        onNavigate={vi.fn()}
      />,
    );
    await user.type(screen.getByTestId(SearchMenuTestId.Input), "Deliv");
    await user.click(screen.getByTestId(`${SearchMenuTestId.Item}-pipelines-delivery`));
    expect(onDetailSelect).toHaveBeenCalledWith({
      kind: "pipeline",
      pipeline: { id: "delivery", name: "Delivery" },
    });
  });

  it("selecting a gate navigates to /gates", async () => {
    const onNavigate = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <ChatPalette
        briefingPending={false}
        onClose={vi.fn()}
        onDetailSelect={vi.fn()}
        onGenerateBriefing={vi.fn()}
        onNavigate={onNavigate}
      />,
    );
    await user.type(screen.getByTestId(SearchMenuTestId.Input), "purchase");
    expect(screen.getByTestId(`${SearchMenuTestId.Item}-gates-ap1`)).toBeInTheDocument();
    await user.click(screen.getByTestId(`${SearchMenuTestId.Item}-gates-ap1`));
    expect(onNavigate).toHaveBeenCalledWith("/gates");
  });

  it("selecting a memory hit navigates to /memory", async () => {
    const onNavigate = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <ChatPalette
        briefingPending={false}
        onClose={vi.fn()}
        onDetailSelect={vi.fn()}
        onGenerateBriefing={vi.fn()}
        onNavigate={onNavigate}
      />,
    );
    await user.type(screen.getByTestId(SearchMenuTestId.Input), "Roadmap");
    await user.click(screen.getByTestId(`${SearchMenuTestId.Item}-memory-note1`));
    expect(onNavigate).toHaveBeenCalledWith("/memory");
  });

  it("selecting the briefing action fires onGenerateBriefing and closes the palette", async () => {
    const onGenerateBriefing = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <ChatPalette
        briefingPending={false}
        onClose={onClose}
        onDetailSelect={vi.fn()}
        onGenerateBriefing={onGenerateBriefing}
        onNavigate={vi.fn()}
      />,
    );
    await user.type(screen.getByTestId(SearchMenuTestId.Input), "briefing");
    expect(screen.getByTestId(`${SearchMenuTestId.Item}-briefing-generate`)).toBeInTheDocument();
    await user.click(screen.getByTestId(`${SearchMenuTestId.Item}-briefing-generate`));
    expect(onGenerateBriefing).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("is findable by a Czech search term and reflects pending state without re-firing", async () => {
    const onGenerateBriefing = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <ChatPalette
        briefingPending
        onClose={onClose}
        onDetailSelect={vi.fn()}
        onGenerateBriefing={onGenerateBriefing}
        onNavigate={vi.fn()}
      />,
    );
    await user.type(screen.getByTestId(SearchMenuTestId.Input), "přehled");
    const item = screen.getByTestId(`${SearchMenuTestId.Item}-briefing-generate`);
    expect(item).toHaveTextContent("Generuji briefing…");
    await user.click(item);
    expect(onGenerateBriefing).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes on a backdrop click", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <ChatPalette
        briefingPending={false}
        onClose={onClose}
        onDetailSelect={vi.fn()}
        onGenerateBriefing={vi.fn()}
        onNavigate={vi.fn()}
      />,
    );
    await user.click(screen.getByTestId(ChatPaletteTestId.Backdrop));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
