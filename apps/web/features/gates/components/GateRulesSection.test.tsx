import { renderWithProviders as render, screen } from "../../../test/render";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GlobalGateRule } from "@zibby/contracts";
import { GateRulesSection } from "./GateRulesSection";

const rule: GlobalGateRule = {
  id: "push-main",
  name: "Push do main",
  match: [{ type: "action", action: "git.push", branch: "main" }],
  decision: "ask",
};

const { hooks } = vi.hoisted(() => ({
  hooks: {
    rules: { data: [] as GlobalGateRule[], isPending: false, isError: false, refetch: vi.fn() },
    remove: vi.fn(),
  },
}));

vi.mock("../queries", () => ({
  useGateRulesQuery: () => hooks.rules,
  useSystemPolicyQuery: () => ({ data: [] }),
}));
vi.mock("../mutations", () => ({
  useCreateGateRuleMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateGateRuleMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteGateRuleMutation: () => ({ mutate: hooks.remove, isPending: false }),
  useReorderGateRulesMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("../../agents", () => ({ useAgentsQuery: () => ({ data: [] }) }));
vi.mock("../../skills", () => ({ useSkillsQuery: () => ({ data: [] }) }));

describe("GateRulesSection — delete confirm dialog (Phase 18.1)", () => {
  beforeEach(() => {
    hooks.rules = { data: [rule], isPending: false, isError: false, refetch: vi.fn() };
    hooks.remove.mockClear();
  });

  it("Delete asks in a CONFIRM dialog before removing the rule", async () => {
    render(<GateRulesSection />);
    await userEvent.click(screen.getByRole("button", { name: "Smazat" }));
    expect(screen.getByText("Smazat pravidlo?")).toBeInTheDocument();
    expect(hooks.remove).not.toHaveBeenCalled();

    const confirm = screen
      .getAllByRole("button", { name: "Smazat" })
      .find((b) => !b.getAttribute("aria-label"));
    await userEvent.click(confirm!);
    expect(hooks.remove).toHaveBeenCalledWith({ params: { id: "push-main" } });
  });

  it("cancelling the confirm dialog never removes the rule", async () => {
    render(<GateRulesSection />);
    await userEvent.click(screen.getByRole("button", { name: "Smazat" }));
    await userEvent.click(screen.getByRole("button", { name: "Zrušit" }));
    expect(hooks.remove).not.toHaveBeenCalled();
    expect(screen.queryByText("Smazat pravidlo?")).not.toBeInTheDocument();
  });
});
