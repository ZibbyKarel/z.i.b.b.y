import type { Agent } from "@zibby/contracts";
import { EntityCardTestId, IconTestId } from "@zibby/design-system";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, renderWithProviders as render, screen, within } from "../../../test/render";
import { LoadErrorTestId } from "../../../components/LoadError/LoadError";
import { AgentsByDepartment, AgentsByDepartmentTestId } from "./AgentsByDepartment";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const refetch = vi.fn();
let state: { data?: Agent[]; isPending: boolean; isError: boolean };
vi.mock("../queries", () => ({
  useAgentsQuery: () => ({ ...state, refetch }),
}));
vi.mock("../../departments/useDepartmentLookup", () => ({
  useDepartmentLookup: () => ({
    list: [
      { id: "dev", name: "Vývoj", code: "DEV" },
      { id: "qa", name: "Kvalita", code: "QA" },
    ],
    get: (id: string) =>
      ({ dev: { name: "Vývoj", code: "DEV" }, qa: { name: "Kvalita", code: "QA" } })[id],
  }),
}));

const agent = (id: string, department: string | undefined, glyph?: string): Agent => ({
  id,
  instructions: "x",
  name: id,
  ...(department ? { department } : {}),
  ...(glyph ? { glyph } : {}),
});

beforeEach(() => {
  push.mockReset();
  refetch.mockReset();
  state = { data: [], isPending: false, isError: false };
});

describe("AgentsByDepartment", () => {
  it("renders a header with name, code and count per department with agents", () => {
    state.data = [agent("a", "dev"), agent("b", "dev"), agent("c", "qa")];
    render(<AgentsByDepartment />);
    const dev = screen.getByTestId(`${AgentsByDepartmentTestId.Section}-dev`);
    expect(within(dev).getByText("Vývoj · DEV · 2")).toBeInTheDocument();
    const qa = screen.getByTestId(`${AgentsByDepartmentTestId.Section}-qa`);
    expect(within(qa).getByText("Kvalita · QA · 1")).toBeInTheDocument();
  });

  it("shows each agent's own glyph, falling back to bot", () => {
    const glyphOf = (a: Agent) => {
      state.data = [a];
      const { unmount } = render(<AgentsByDepartment />);
      const html = within(screen.getByTestId(EntityCardTestId.Glyph)).getByTestId(
        IconTestId.Root,
      ).innerHTML;
      unmount();
      return html;
    };
    const compass = glyphOf(agent("a", "dev", "compass"));
    const bot = glyphOf(agent("a", "dev", "bot"));
    const fallback = glyphOf(agent("a", "dev"));
    expect(compass).not.toBe(bot);
    expect(fallback).toBe(bot);
  });

  it("puts agents with an absent or unknown department last, under 'Bez oddělení'", () => {
    state.data = [agent("a", "ghost"), agent("b", undefined), agent("c", "dev")];
    render(<AgentsByDepartment />);
    const none = screen.getByTestId(`${AgentsByDepartmentTestId.Section}-none`);
    expect(within(none).getByText("Bez oddělení · 2")).toBeInTheDocument();
    const sections = screen.getAllByTestId(new RegExp(`^${AgentsByDepartmentTestId.Section}-`));
    expect(sections.at(-1)).toBe(none);
  });

  it("navigates to the agent detail on card click", () => {
    state.data = [agent("koder", "dev")];
    render(<AgentsByDepartment />);
    fireEvent.click(screen.getByTestId(EntityCardTestId.Open));
    expect(push).toHaveBeenCalledWith("/workforce/agents/koder");
  });

  it("shows a retryable error", () => {
    state = { isPending: false, isError: true };
    render(<AgentsByDepartment />);
    fireEvent.click(screen.getByTestId(LoadErrorTestId.Retry));
    expect(refetch).toHaveBeenCalled();
  });

  it("shows the empty copy without agents", () => {
    render(<AgentsByDepartment />);
    expect(screen.getByTestId(AgentsByDepartmentTestId.Empty)).toHaveTextContent(
      "Zatím žádní agenti.",
    );
  });
});
