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

// Phase 87: the `department` filter prop is the Gates tab's third call site —
// Settings (the other call site above; F10 deleted the standalone `/gates` page
// that used to be the third, O8) never passes it, so this is purely additive
// behavior gated behind an opt-in prop.
describe("GateRulesSection — department filter + auto-tag (Phase 87)", () => {
  const devRule: GlobalGateRule = {
    id: "gr-dev",
    name: "Dev rule",
    match: [{ type: "action", action: "deploy" }],
    decision: "allow",
    department: "dev",
  };
  const opsRule: GlobalGateRule = {
    id: "gr-ops",
    name: "Ops rule",
    match: [{ type: "action", action: "notify" }],
    decision: "notify",
    department: "ops",
  };
  const untaggedRule: GlobalGateRule = {
    id: "gr-global",
    name: "Global rule",
    match: [{ type: "scope", scope: "*" }],
    decision: "deny",
  };

  beforeEach(() => {
    hooks.rules = {
      data: [devRule, opsRule, untaggedRule],
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    };
    hooks.create.mockClear();
    hooks.update.mockClear();
  });

  it("with no department prop, shows every rule (today's two call sites)", () => {
    render(<GateRulesSection />);
    expect(screen.getByText("Dev rule")).toBeInTheDocument();
    expect(screen.getByText("Ops rule")).toBeInTheDocument();
    expect(screen.getByText("Global rule")).toBeInTheDocument();
  });

  it("with department set, shows only that department's tagged rules", () => {
    render(<GateRulesSection department="dev" />);
    expect(screen.getByText("Dev rule")).toBeInTheDocument();
    expect(screen.queryByText("Ops rule")).not.toBeInTheDocument();
    expect(screen.queryByText("Global rule")).not.toBeInTheDocument();
  });

  it("auto-tags a rule created from a department-scoped call site", async () => {
    render(<GateRulesSection department="dev" />);
    await userEvent.click(screen.getByRole("button", { name: "Přidat pravidlo" }));
    await userEvent.type(screen.getByLabelText("Sloveso akce"), "merge");
    await userEvent.click(screen.getByRole("button", { name: "Uložit pravidlo" }));

    expect(hooks.create).toHaveBeenCalledTimes(1);
    const [callArgs] = hooks.create.mock.calls[0]!;
    expect(callArgs.body.department).toBe("dev");
  });

  // NS2 F3a: a tagged rule is load-bearing (a per-department evaluation bucket),
  // so the card names its owner scope with a glyph+name Tag.
  it("renders the owner-department tag exactly on tagged rules (NS2 F3a)", () => {
    render(<GateRulesSection />);
    const tags = screen.getAllByTestId("global-rule-card-owner-tag");
    // devRule + opsRule are tagged; untaggedRule renders no owner tag.
    expect(tags).toHaveLength(2);
    expect(tags[0]).toHaveTextContent("Dev");
    expect(tags[1]).toHaveTextContent("Ops");
  });

  it("preserves an existing tag on edit, even though the edit form has no tag field", async () => {
    render(<GateRulesSection />);
    // Editing the untagged call site's own `devRule` (no `department`
    // prop) must not drop its existing tag.
    const editButtons = screen.getAllByRole("button", { name: "Upravit" });
    await userEvent.click(editButtons[0]!);
    await userEvent.click(screen.getByRole("button", { name: "Uložit pravidlo" }));

    expect(hooks.update).toHaveBeenCalledTimes(1);
    const [callArgs] = hooks.update.mock.calls[0]!;
    expect(callArgs.body.department).toBe("dev");
  });
});
