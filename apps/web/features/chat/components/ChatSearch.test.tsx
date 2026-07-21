import { useRef } from "react";
import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, screen } from "../../../test/render";

// Every kind in the broadened index (B2) is backed by its own hook — stub each
// with one fixture so `ChatSearch`'s tests control exactly what comes back and
// never hit the network, mirroring the deleted `ChatPalette.test.tsx`'s pattern.
vi.mock("../../agents/queries/useAgentsQuery", () => ({
  useAgentsQuery: () => ({ data: [{ id: "builder", name: "Builder", glyph: "bot" }] }),
  getAgentsQueryKey: () => ["agents"],
}));
vi.mock("../../pipelines/queries/usePipelinesQuery", () => ({
  usePipelinesQuery: () => ({ data: [{ id: "delivery", name: "Delivery" }] }),
  getPipelinesQueryKey: () => ["pipelines"],
}));
vi.mock("../../subsystems/queries/useSubsystemsQuery", () => ({
  useSubsystemsQuery: () => ({ data: [] }),
  getSubsystemsQueryKey: () => ["subsystems"],
}));
vi.mock("../../runs/queries/useRunsQuery", () => ({
  useRunsQuery: () => ({ runs: [], isPending: false, isError: false, refetch: vi.fn() }),
}));
vi.mock("../../skills/queries/useSkillsQuery", () => ({
  useSkillsQuery: () => ({ data: [] }),
  getSkillsQueryKey: () => ["skills"],
}));
vi.mock("../../mcp/queries/useMcpServersQuery", () => ({
  useMcpServersQuery: () => ({ data: [] }),
  getMcpServersQueryKey: () => ["mcp", "servers"],
}));
vi.mock("../../projects/queries/useProjectsQuery", () => ({
  useProjectsQuery: () => ({ data: [{ id: "alpha", name: "Alpha" }] }),
  getProjectsQueryKey: () => ["projects"],
}));
vi.mock("../../commands/queries/useCommandsQuery", () => ({
  useCommandsQuery: () => ({ data: [] }),
  getCommandsQueryKey: () => ["commands"],
}));
vi.mock("../../companies/queries/useCompaniesQuery", () => ({
  useCompaniesQuery: () => ({ data: [] }),
  getCompaniesQueryKey: () => ["companies"],
}));
vi.mock("../../memory/queries/useMemorySearchQuery", () => ({
  useMemorySearchQuery: () => ({ data: undefined, isFetching: false }),
  getMemorySearchQueryKey: (q: string) => ["memory", "search", q],
}));

import { ChatSearch, type ChatSearchHandle, ChatSearchTestId } from "./ChatSearch";

function Harness(props: Partial<Parameters<typeof ChatSearch>[0]> = {}) {
  return (
    <ChatSearch
      briefingPending={false}
      onDetailSelect={vi.fn()}
      onGenerateBriefing={vi.fn()}
      onNavigate={vi.fn()}
      onOpenRun={vi.fn()}
      onSelectSubsystem={vi.fn()}
      {...props}
    />
  );
}

describe("ChatSearch", () => {
  it("stays collapsed with no panel until focused", () => {
    renderWithProviders(<Harness />);
    expect(screen.getByTestId(ChatSearchTestId.Root)).toBeInTheDocument();
    expect(screen.queryByTestId(ChatSearchTestId.Panel)).not.toBeInTheDocument();
  });

  it("expands and drops the results panel directly below on focus", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness />);

    await user.click(screen.getByTestId(ChatSearchTestId.Input));

    expect(screen.getByTestId(ChatSearchTestId.Panel)).toBeInTheDocument();
    expect(screen.getByTestId(ChatSearchTestId.Backdrop)).toBeInTheDocument();
    expect(screen.getByTestId(`${ChatSearchTestId.Item}-agent-builder`)).toBeInTheDocument();
    expect(screen.getByTestId(`${ChatSearchTestId.Item}-pipeline-delivery`)).toBeInTheDocument();
  });

  it("picking an agent hands its full record to onDetailSelect and closes the panel", async () => {
    const onDetailSelect = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<Harness onDetailSelect={onDetailSelect} />);

    await user.click(screen.getByTestId(ChatSearchTestId.Input));
    await user.click(screen.getByTestId(`${ChatSearchTestId.Item}-agent-builder`));

    expect(onDetailSelect).toHaveBeenCalledWith({
      kind: "agent",
      agent: { id: "builder", name: "Builder", glyph: "bot" },
    });
    expect(screen.queryByTestId(ChatSearchTestId.Panel)).not.toBeInTheDocument();
  });

  it("picking a project (a navigate-away kind) calls onNavigate with its route", async () => {
    const onNavigate = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<Harness onNavigate={onNavigate} />);

    await user.click(screen.getByTestId(ChatSearchTestId.Input));
    await user.click(screen.getByTestId(`${ChatSearchTestId.Item}-project-alpha`));

    expect(onNavigate).toHaveBeenCalledWith("/projects/alpha");
  });

  it("picking the briefing action fires onGenerateBriefing", async () => {
    const onGenerateBriefing = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<Harness onGenerateBriefing={onGenerateBriefing} />);

    await user.click(screen.getByTestId(ChatSearchTestId.Input));
    await user.type(screen.getByTestId(ChatSearchTestId.Input), "briefing");
    await user.click(screen.getByTestId(`${ChatSearchTestId.Item}-action-generate-briefing`));

    expect(onGenerateBriefing).toHaveBeenCalledTimes(1);
  });

  it("Esc closes the panel", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness />);

    await user.click(screen.getByTestId(ChatSearchTestId.Input));
    expect(screen.getByTestId(ChatSearchTestId.Panel)).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByTestId(ChatSearchTestId.Panel)).not.toBeInTheDocument();
  });

  it("exposes an imperative focus() handle that opens the panel and focuses the input", async () => {
    const user = userEvent.setup();
    function RefHarness() {
      const ref = useRef<ChatSearchHandle>(null);
      return (
        <>
          <button onClick={() => ref.current?.focus()} type="button">
            trigger
          </button>
          <Harness ref={ref} />
        </>
      );
    }
    renderWithProviders(<RefHarness />);

    expect(screen.queryByTestId(ChatSearchTestId.Panel)).not.toBeInTheDocument();
    await user.click(screen.getByText("trigger"));
    expect(screen.getByTestId(ChatSearchTestId.Panel)).toBeInTheDocument();
    expect(screen.getByTestId(ChatSearchTestId.Input)).toHaveFocus();
  });
});
