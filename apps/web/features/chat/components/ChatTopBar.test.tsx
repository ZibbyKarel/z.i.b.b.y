import type { RefObject } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen } from "../../../test/render";
import type { ChatSearchHandle } from "./ChatSearch";
import { ChatTopBar, ChatTopBarTestId } from "./ChatTopBar";

// `ChatSearch` (mounted unconditionally now, unlike the old palette) reads every
// one of these query hooks to build its live index — stub each with an empty
// list so the bar renders without hitting the network, matching the convention
// `ChatScreen.test.tsx` already follows for its own mounted children.
vi.mock("../../agents/queries/useAgentsQuery", () => ({
  useAgentsQuery: () => ({ data: [] }),
  getAgentsQueryKey: () => ["agents"],
}));
vi.mock("../../pipelines/queries/usePipelinesQuery", () => ({
  usePipelinesQuery: () => ({ data: [] }),
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
  useProjectsQuery: () => ({ data: [] }),
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
// The status pill (approvals feed) and limits gauge — mounted alongside the
// search, same as every other ChatTopBar element.
vi.mock("../../approvals/queries/useApprovalsQuery", () => ({
  useApprovalsQuery: () => ({ data: [], isPending: false }),
  getApprovalsQueryKey: () => ["approvals"],
}));
vi.mock("../../limits/queries/useLimitsQuery", () => ({
  useLimitsQuery: () => ({ data: undefined }),
}));

function searchRef(): RefObject<ChatSearchHandle | null> {
  return { current: null };
}

function renderTopBar() {
  return renderWithProviders(
    <ChatTopBar
      briefingPending={false}
      onDetailSelect={vi.fn()}
      onGenerateBriefing={vi.fn()}
      onNavigate={vi.fn()}
      onOpenRun={vi.fn()}
      onSelectSubsystem={vi.fn()}
      searchRef={searchRef()}
    />,
  );
}

describe("ChatTopBar", () => {
  it("renders the glass bar with the status, search, limits and lang elements", () => {
    renderTopBar();
    expect(screen.getByTestId(ChatTopBarTestId.Root)).toBeInTheDocument();
    expect(screen.getByTestId(ChatTopBarTestId.Search)).toBeInTheDocument();
    expect(screen.getByTestId(ChatTopBarTestId.Lang)).toBeInTheDocument();
  });

  it("has no mode sign, mode dot or clock (removed for 1:1)", () => {
    renderTopBar();
    expect(screen.queryByTestId("chat-top-bar-mode")).toBeNull();
    expect(screen.queryByTestId("chat-screen-mode-dot")).toBeNull();
    expect(screen.queryByTestId("chat-top-bar-clock")).toBeNull();
  });

  // F9/O7: the topbar used to carry a fifth element, a "switch to HUD" icon,
  // pointing at `/chat` (its own page) once `/overview` was deleted in F8d —
  // a control that navigates to the page you're already on. The operator's
  // call: remove it outright rather than leave a broken affordance.
  it("has no HUD-switch element — four elements, not five (O7)", () => {
    renderTopBar();
    expect(screen.queryByTestId("chat-top-bar-hud")).toBeNull();
    expect(screen.getByTestId(ChatTopBarTestId.Lang)).toBeInTheDocument();
  });
});
