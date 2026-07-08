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
    create: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("../queries", () => ({
  useGateRulesQuery: () => hooks.rules,
  useSystemPolicyQuery: () => ({ data: [] }),
}));
vi.mock("../mutations", () => ({
  useCreateGateRuleMutation: () => ({ mutate: hooks.create, isPending: false }),
  useUpdateGateRuleMutation: () => ({ mutate: hooks.update, isPending: false }),
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

// Phase 87: the `ownerSubsystem` filter prop is the Gates tab's third call site —
// `/gates` and Settings (both call sites above) never pass it, so this is purely
// additive behavior gated behind an opt-in prop.
describe("GateRulesSection — ownerSubsystem filter + auto-tag (Phase 87)", () => {
  const forgeRule: GlobalGateRule = {
    id: "gr-forge",
    name: "Forge rule",
    match: [{ type: "action", action: "deploy" }],
    decision: "allow",
    ownerSubsystem: "forge",
  };
  const pulsRule: GlobalGateRule = {
    id: "gr-puls",
    name: "Puls rule",
    match: [{ type: "action", action: "notify" }],
    decision: "notify",
    ownerSubsystem: "puls",
  };
  const untaggedRule: GlobalGateRule = {
    id: "gr-global",
    name: "Global rule",
    match: [{ type: "scope", scope: "*" }],
    decision: "deny",
  };

  beforeEach(() => {
    hooks.rules = {
      data: [forgeRule, pulsRule, untaggedRule],
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    };
    hooks.create.mockClear();
    hooks.update.mockClear();
  });

  it("with no ownerSubsystem prop, shows every rule (today's two call sites)", () => {
    render(<GateRulesSection />);
    expect(screen.getByText("Forge rule")).toBeInTheDocument();
    expect(screen.getByText("Puls rule")).toBeInTheDocument();
    expect(screen.getByText("Global rule")).toBeInTheDocument();
  });

  it("with ownerSubsystem set, shows only that subsystem's tagged rules", () => {
    render(<GateRulesSection ownerSubsystem="forge" />);
    expect(screen.getByText("Forge rule")).toBeInTheDocument();
    expect(screen.queryByText("Puls rule")).not.toBeInTheDocument();
    expect(screen.queryByText("Global rule")).not.toBeInTheDocument();
  });

  it("auto-tags a rule created from a subsystem-scoped call site", async () => {
    render(<GateRulesSection ownerSubsystem="forge" />);
    await userEvent.click(screen.getByRole("button", { name: "Přidat pravidlo" }));
    await userEvent.type(screen.getByLabelText("Sloveso akce"), "merge");
    await userEvent.click(screen.getByRole("button", { name: "Uložit pravidlo" }));

    expect(hooks.create).toHaveBeenCalledTimes(1);
    const [callArgs] = hooks.create.mock.calls[0]!;
    expect(callArgs.body.ownerSubsystem).toBe("forge");
  });

  it("preserves an existing tag on edit, even though the edit form has no tag field", async () => {
    render(<GateRulesSection />);
    // Editing the untagged call site's own `forgeRule` (via the plain `/gates`
    // page, no `ownerSubsystem` prop) must not drop its existing tag.
    const editButtons = screen.getAllByRole("button", { name: "Upravit" });
    await userEvent.click(editButtons[0]!);
    await userEvent.click(screen.getByRole("button", { name: "Uložit pravidlo" }));

    expect(hooks.update).toHaveBeenCalledTimes(1);
    const [callArgs] = hooks.update.mock.calls[0]!;
    expect(callArgs.body.ownerSubsystem).toBe("forge");
  });
});
