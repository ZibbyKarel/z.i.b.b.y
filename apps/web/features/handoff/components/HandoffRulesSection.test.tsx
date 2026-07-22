import type { HandoffRule } from "@zibby/contracts";
import { DropdownTestId } from "@zibby/design-system";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders as render, screen, within } from "../../../test/render";
import { HandoffRuleEditorTestId } from "./HandoffRuleEditor";
import { HandoffRuleRowTestId } from "./HandoffRuleRow";
import { HandoffRulesSection } from "./HandoffRulesSection";

const { hooks } = vi.hoisted(() => ({
  hooks: {
    subsystems: [] as { id: string; name: string }[],
    pipelines: [] as { id: string; name: string; ownerSubsystem?: string }[],
    agents: [] as { id: string; ownerSubsystem?: string }[],
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  },
}));

vi.mock("../mutations", () => ({
  useCreateHandoffRuleMutation: () => ({ mutate: hooks.create, isPending: false }),
  useUpdateHandoffRuleMutation: () => ({ mutate: hooks.update, isPending: false }),
  useDeleteHandoffRuleMutation: () => ({ mutate: hooks.remove, isPending: false }),
}));
vi.mock("../../subsystems/queries", () => ({
  useSubsystemsQuery: () => ({ data: hooks.subsystems }),
}));
vi.mock("../../pipelines", () => ({
  usePipelinesQuery: () => ({ data: hooks.pipelines }),
}));
vi.mock("../../agents/queries", () => ({
  useAgentsQuery: () => ({ data: hooks.agents }),
}));

const userRule: HandoffRule = {
  id: "hr-1",
  from: "forge",
  signalKind: "post-merge-red",
  to: { kind: "subsystem", id: "sentinel" },
  tier: 2,
  enabled: true,
};

const systemRule: HandoffRule = {
  id: "hr-system",
  from: "forge",
  signalKind: "cve",
  minSeverity: "critical",
  to: { kind: "pipeline", id: "hotfix" },
  tier: 3,
  enabled: true,
  system: true,
};

describe("HandoffRulesSection (P2)", () => {
  beforeEach(() => {
    hooks.subsystems = [
      { id: "forge", name: "Forge" },
      { id: "sentinel", name: "Sentinel" },
    ];
    hooks.pipelines = [{ id: "hotfix", name: "Hotfix" }];
    hooks.agents = [];
    hooks.create.mockClear();
    hooks.update.mockClear();
    hooks.remove.mockClear();
  });

  it("renders only the given rules — one row per rule", () => {
    render(
      <HandoffRulesSection
        fromSubsystemId="forge"
        rules={[userRule, systemRule]}
        subsystemName="Forge"
      />,
    );
    expect(screen.getAllByTestId(HandoffRuleRowTestId.Root)).toHaveLength(2);
    expect(screen.getByText("Červené CI po merge")).toBeInTheDocument();
    expect(screen.getByText("Zranitelnost (CVE)")).toBeInTheDocument();
  });

  it("shows an empty state when there are no rules", () => {
    render(<HandoffRulesSection fromSubsystemId="forge" rules={[]} subsystemName="Forge" />);
    expect(screen.queryByTestId(HandoffRuleRowTestId.Root)).not.toBeInTheDocument();
    expect(screen.getByText("Zatím žádná odchozí pravidla")).toBeInTheDocument();
  });

  it("hides the delete affordance for a system rule but shows it for a user rule", () => {
    render(
      <HandoffRulesSection
        fromSubsystemId="forge"
        rules={[userRule, systemRule]}
        subsystemName="Forge"
      />,
    );
    const deleteButtons = screen.getAllByTestId(HandoffRuleRowTestId.Delete);
    // Only the user-authored rule offers a delete button — the system rule's
    // row renders none at all (a delete of it would 403 server-side).
    expect(deleteButtons).toHaveLength(1);
  });

  it("renders an inline editor in create mode from the add button", async () => {
    render(<HandoffRulesSection fromSubsystemId="forge" rules={[]} subsystemName="Forge" />);
    await userEvent.click(screen.getByRole("button", { name: "Přidat pravidlo" }));
    expect(screen.getByTestId(HandoffRuleEditorTestId.Root)).toBeInTheDocument();
  });

  it("computes receiverSubsystemIds from pipelines+agents' ownerSubsystem and keeps a non-receiver subsystem out of the target dropdown", async () => {
    // "sentinel" owns neither a pipeline nor an agent — only "forge" (via the
    // pipeline) qualifies as a receiver, mirroring the server's
    // `resolveSubsystemTarget` roster check.
    hooks.pipelines = [{ id: "hotfix", name: "Hotfix", ownerSubsystem: "forge" }];
    hooks.agents = [];
    render(<HandoffRulesSection fromSubsystemId="forge" rules={[]} subsystemName="Forge" />);
    await userEvent.click(screen.getByRole("button", { name: "Přidat pravidlo" }));

    const wrapper = screen.getByTestId(HandoffRuleEditorTestId.Target);
    await userEvent.click(within(wrapper).getByTestId(DropdownTestId.Trigger));
    const panel = screen.getByTestId(DropdownTestId.Panel);
    expect(within(panel).queryByText("Sentinel")).not.toBeInTheDocument();
    expect(within(panel).getByText("Forge")).toBeInTheDocument();
  });

  it("toggling a rule fires the update mutation with the full rule minus id", async () => {
    render(
      <HandoffRulesSection fromSubsystemId="forge" rules={[userRule]} subsystemName="Forge" />,
    );
    await userEvent.click(screen.getByTestId(HandoffRuleRowTestId.Toggle));
    expect(hooks.update).toHaveBeenCalledWith({
      params: { id: "hr-1" },
      body: {
        from: "forge",
        signalKind: "post-merge-red",
        to: { kind: "subsystem", id: "sentinel" },
        tier: 2,
        enabled: false,
      },
    });
  });

  it("toggling a system rule preserves the system flag in the update payload", async () => {
    render(
      <HandoffRulesSection fromSubsystemId="forge" rules={[systemRule]} subsystemName="Forge" />,
    );
    await userEvent.click(screen.getByTestId(HandoffRuleRowTestId.Toggle));
    const [callArgs] = hooks.update.mock.calls[0]!;
    expect(callArgs.body.system).toBe(true);
    expect(callArgs.body.enabled).toBe(false);
  });

  it("Delete asks in a confirm dialog before removing the rule", async () => {
    render(
      <HandoffRulesSection fromSubsystemId="forge" rules={[userRule]} subsystemName="Forge" />,
    );
    await userEvent.click(screen.getByTestId(HandoffRuleRowTestId.Delete));
    expect(screen.getByText("Smazat pravidlo předávání?")).toBeInTheDocument();
    expect(hooks.remove).not.toHaveBeenCalled();

    // The row's own delete icon-button also carries the "Smazat" aria-label —
    // the dialog's confirm button is the one with no aria-label (its visible
    // text child IS its accessible name), same disambiguation `GateRulesSection`'s
    // own delete-confirm test uses.
    const confirm = screen
      .getAllByRole("button", { name: "Smazat" })
      .find((b) => !b.getAttribute("aria-label"));
    await userEvent.click(confirm!);
    expect(hooks.remove).toHaveBeenCalledWith({ params: { id: "hr-1" } });
  });
});
