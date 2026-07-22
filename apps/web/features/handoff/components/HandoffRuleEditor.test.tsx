import type { HandoffRule, HandoffSignalKind } from "@zibby/contracts";
import { DropdownTestId } from "@zibby/design-system";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders as render, screen, within } from "../../../test/render";
import { HandoffRuleEditor, HandoffRuleEditorTestId } from "./HandoffRuleEditor";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const subsystems = [
  { id: "forge", name: "Forge" },
  { id: "sentinel", name: "Sentinel" },
];
const pipelines = [{ id: "hotfix", name: "Hotfix" }];
const receiverSubsystemIds = ["forge", "sentinel"];

const signalKinds: HandoffSignalKind[] = [
  {
    id: "cve",
    from: "sentinel",
    label: "Vulnerability (CVE)",
    description: "A vulnerability found in a project dependency.",
    severityBearing: true,
    status: "builtin",
    system: true,
  },
  {
    id: "secret",
    from: "sentinel",
    label: "Leaked secret",
    description: "A secret key or password leaked in code.",
    severityBearing: true,
    status: "builtin",
    system: true,
  },
  {
    id: "post-merge-red",
    from: "maestro",
    label: "Red CI after merge",
    description: "CI failed after a PR was merged.",
    severityBearing: true,
    status: "builtin",
    system: true,
  },
  {
    id: "flaky-op-signal",
    from: "sentinel",
    label: "Flaky Op Signal",
    description: "Operator-authored signal for sentinel.",
    severityBearing: false,
    status: "active",
  },
  {
    id: "not-yet-emitted",
    from: "sentinel",
    label: "Not Yet Emitted",
    description: "An operator-authored signal awaiting its producer.",
    severityBearing: false,
    status: "pending",
  },
];

const existingRule: HandoffRule = {
  id: "hr-1",
  from: "sentinel",
  signalKind: "cve",
  minSeverity: "high",
  to: { kind: "subsystem", id: "forge" },
  tier: 2,
  enabled: true,
};

/** Open a pill's dropdown and click the option with the given text. */
async function pick(testId: string, optionText: string) {
  const wrapper = screen.getByTestId(testId);
  const trigger = within(wrapper).getByTestId(DropdownTestId.Trigger);
  await userEvent.click(trigger);
  const panel = screen.getByTestId(DropdownTestId.Panel);
  await userEvent.click(within(panel).getByText(optionText));
}

describe("HandoffRuleEditor (P2 inline)", () => {
  beforeEach(() => {
    push.mockClear();
  });

  it('"+ nový signál" NAVIGATES to /signals/new with the drawer\'s from prefilled', async () => {
    render(
      <HandoffRuleEditor
        fromSubsystemId="sentinel"
        onCancel={vi.fn()}
        onSave={vi.fn()}
        pipelines={pipelines}
        receiverSubsystemIds={receiverSubsystemIds}
        signalKinds={signalKinds}
        subsystemName="Sentinel"
        subsystems={subsystems}
      />,
    );
    expect(screen.getByTestId(HandoffRuleEditorTestId.NewSignal)).toBeInTheDocument();
    await userEvent.click(screen.getByTestId(HandoffRuleEditorTestId.NewSignal));
    expect(push).toHaveBeenCalledWith("/signals/new?from=sentinel");
  });

  it("renders the sentence with the subsystem name", () => {
    render(
      <HandoffRuleEditor
        fromSubsystemId="sentinel"
        onCancel={vi.fn()}
        onSave={vi.fn()}
        pipelines={pipelines}
        receiverSubsystemIds={receiverSubsystemIds}
        signalKinds={signalKinds}
        subsystemName="Sentinel"
        subsystems={subsystems}
      />,
    );
    expect(screen.getByTestId(HandoffRuleEditorTestId.Root)).toBeInTheDocument();
    expect(screen.getByText("Když Sentinel vyprodukuje")).toBeInTheDocument();
  });

  it("Save is disabled when there is no target (no subsystems/pipelines available)", () => {
    render(
      <HandoffRuleEditor
        fromSubsystemId="sentinel"
        onCancel={vi.fn()}
        onSave={vi.fn()}
        pipelines={[]}
        receiverSubsystemIds={[]}
        signalKinds={signalKinds}
        subsystemName="Sentinel"
        subsystems={[]}
      />,
    );
    expect(screen.getByTestId(HandoffRuleEditorTestId.Save)).toBeDisabled();
  });

  it("Cancel calls onCancel", async () => {
    const onCancel = vi.fn();
    render(
      <HandoffRuleEditor
        fromSubsystemId="sentinel"
        onCancel={onCancel}
        onSave={vi.fn()}
        pipelines={pipelines}
        receiverSubsystemIds={receiverSubsystemIds}
        signalKinds={signalKinds}
        subsystemName="Sentinel"
        subsystems={subsystems}
      />,
    );
    await userEvent.click(screen.getByTestId(HandoffRuleEditorTestId.Cancel));
    expect(onCancel).toHaveBeenCalled();
  });

  it("defaults to a known signal kind, subsystem target and tier 2 for a new rule, and saves it", async () => {
    const onSave = vi.fn();
    render(
      <HandoffRuleEditor
        fromSubsystemId="sentinel"
        onCancel={vi.fn()}
        onSave={onSave}
        pipelines={pipelines}
        receiverSubsystemIds={receiverSubsystemIds}
        signalKinds={signalKinds}
        subsystemName="Sentinel"
        subsystems={subsystems}
      />,
    );
    await userEvent.click(screen.getByTestId(HandoffRuleEditorTestId.Save));
    expect(onSave).toHaveBeenCalledWith({
      from: "sentinel",
      signalKind: "cve",
      to: { kind: "subsystem", id: "forge" },
      tier: 2,
      enabled: true,
    });
  });

  it("selecting the any-signal option saves signalKind '*'", async () => {
    const onSave = vi.fn();
    render(
      <HandoffRuleEditor
        fromSubsystemId="sentinel"
        onCancel={vi.fn()}
        onSave={onSave}
        pipelines={pipelines}
        receiverSubsystemIds={receiverSubsystemIds}
        signalKinds={signalKinds}
        subsystemName="Sentinel"
        subsystems={subsystems}
      />,
    );
    await pick(HandoffRuleEditorTestId.SignalKind, "Jakýkoli signál (∗)");
    await userEvent.click(screen.getByTestId(HandoffRuleEditorTestId.Save));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ signalKind: "*" }));
  });

  it("leaving severity as 'any' omits minSeverity from the saved input", async () => {
    const onSave = vi.fn();
    render(
      <HandoffRuleEditor
        fromSubsystemId="sentinel"
        onCancel={vi.fn()}
        onSave={onSave}
        pipelines={pipelines}
        receiverSubsystemIds={receiverSubsystemIds}
        signalKinds={signalKinds}
        subsystemName="Sentinel"
        subsystems={subsystems}
      />,
    );
    await userEvent.click(screen.getByTestId(HandoffRuleEditorTestId.Save));
    const [input] = onSave.mock.calls[0]!;
    expect(input).not.toHaveProperty("minSeverity");
  });

  it("picking a severity includes minSeverity in the saved input", async () => {
    const onSave = vi.fn();
    render(
      <HandoffRuleEditor
        fromSubsystemId="sentinel"
        onCancel={vi.fn()}
        onSave={onSave}
        pipelines={pipelines}
        receiverSubsystemIds={receiverSubsystemIds}
        signalKinds={signalKinds}
        subsystemName="Sentinel"
        subsystems={subsystems}
      />,
    );
    await pick(HandoffRuleEditorTestId.Severity, "vysoká");
    await userEvent.click(screen.getByTestId(HandoffRuleEditorTestId.Save));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ minSeverity: "high" }));
  });

  it("picking a pipeline target splits into { kind: 'pipeline', id }", async () => {
    const onSave = vi.fn();
    render(
      <HandoffRuleEditor
        fromSubsystemId="sentinel"
        onCancel={vi.fn()}
        onSave={onSave}
        pipelines={pipelines}
        receiverSubsystemIds={receiverSubsystemIds}
        signalKinds={signalKinds}
        subsystemName="Sentinel"
        subsystems={subsystems}
      />,
    );
    await pick(HandoffRuleEditorTestId.Target, "Hotfix");
    await userEvent.click(screen.getByTestId(HandoffRuleEditorTestId.Save));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ to: { kind: "pipeline", id: "hotfix" } }),
    );
  });

  it("picking a subsystem target splits into { kind: 'subsystem', id }", async () => {
    const onSave = vi.fn();
    render(
      <HandoffRuleEditor
        fromSubsystemId="sentinel"
        onCancel={vi.fn()}
        onSave={onSave}
        pipelines={pipelines}
        receiverSubsystemIds={receiverSubsystemIds}
        signalKinds={signalKinds}
        subsystemName="Sentinel"
        subsystems={subsystems}
      />,
    );
    await pick(HandoffRuleEditorTestId.Target, "Forge");
    await userEvent.click(screen.getByTestId(HandoffRuleEditorTestId.Save));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ to: { kind: "subsystem", id: "forge" } }),
    );
  });

  it("changing the tier clause saves the numeric tier", async () => {
    const onSave = vi.fn();
    render(
      <HandoffRuleEditor
        fromSubsystemId="sentinel"
        onCancel={vi.fn()}
        onSave={onSave}
        pipelines={pipelines}
        receiverSubsystemIds={receiverSubsystemIds}
        signalKinds={signalKinds}
        subsystemName="Sentinel"
        subsystems={subsystems}
      />,
    );
    await pick(HandoffRuleEditorTestId.Tier, "automaticky");
    await userEvent.click(screen.getByTestId(HandoffRuleEditorTestId.Save));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ tier: 1 }));
  });

  it("seeds every pill from `initial` when editing an existing rule", async () => {
    const onSave = vi.fn();
    render(
      <HandoffRuleEditor
        fromSubsystemId="sentinel"
        initial={existingRule}
        onCancel={vi.fn()}
        onSave={onSave}
        pipelines={pipelines}
        receiverSubsystemIds={receiverSubsystemIds}
        signalKinds={signalKinds}
        subsystemName="Sentinel"
        subsystems={subsystems}
      />,
    );
    await userEvent.click(screen.getByTestId(HandoffRuleEditorTestId.Save));
    expect(onSave).toHaveBeenCalledWith({
      from: "sentinel",
      signalKind: "cve",
      minSeverity: "high",
      to: { kind: "subsystem", id: "forge" },
      tier: 2,
      enabled: true,
    });
  });

  describe("receiver-scoped target (Slot A)", () => {
    it("omits a subsystem with no pipeline/agent (not in receiverSubsystemIds) from the target dropdown", async () => {
      render(
        <HandoffRuleEditor
          fromSubsystemId="sentinel"
          onCancel={vi.fn()}
          onSave={vi.fn()}
          pipelines={pipelines}
          receiverSubsystemIds={["forge"]}
          signalKinds={signalKinds}
          subsystemName="Sentinel"
          subsystems={subsystems}
        />,
      );
      const wrapper = screen.getByTestId(HandoffRuleEditorTestId.Target);
      await userEvent.click(within(wrapper).getByTestId(DropdownTestId.Trigger));
      const panel = screen.getByTestId(DropdownTestId.Panel);
      expect(within(panel).queryByText("Sentinel")).not.toBeInTheDocument();
      expect(within(panel).getByText("Forge")).toBeInTheDocument();
    });

    it("includes a subsystem in receiverSubsystemIds in the target dropdown", async () => {
      render(
        <HandoffRuleEditor
          fromSubsystemId="sentinel"
          onCancel={vi.fn()}
          onSave={vi.fn()}
          pipelines={pipelines}
          receiverSubsystemIds={["forge", "sentinel"]}
          signalKinds={signalKinds}
          subsystemName="Sentinel"
          subsystems={subsystems}
        />,
      );
      const wrapper = screen.getByTestId(HandoffRuleEditorTestId.Target);
      await userEvent.click(within(wrapper).getByTestId(DropdownTestId.Trigger));
      const panel = screen.getByTestId(DropdownTestId.Panel);
      expect(within(panel).getByText("Sentinel")).toBeInTheDocument();
    });

    it("always shows pipelines in the target dropdown regardless of receiverSubsystemIds", async () => {
      render(
        <HandoffRuleEditor
          fromSubsystemId="sentinel"
          onCancel={vi.fn()}
          onSave={vi.fn()}
          pipelines={pipelines}
          receiverSubsystemIds={[]}
          signalKinds={signalKinds}
          subsystemName="Sentinel"
          subsystems={subsystems}
        />,
      );
      const wrapper = screen.getByTestId(HandoffRuleEditorTestId.Target);
      await userEvent.click(within(wrapper).getByTestId(DropdownTestId.Trigger));
      const panel = screen.getByTestId(DropdownTestId.Panel);
      expect(within(panel).getByText("Hotfix")).toBeInTheDocument();
    });

    it("preserves the currently-edited rule's non-receiver target subsystem as a visible, selected option", () => {
      render(
        <HandoffRuleEditor
          fromSubsystemId="sentinel"
          initial={existingRule}
          onCancel={vi.fn()}
          onSave={vi.fn()}
          pipelines={pipelines}
          receiverSubsystemIds={[]}
          signalKinds={signalKinds}
          subsystemName="Sentinel"
          subsystems={subsystems}
        />,
      );
      // `existingRule.to` is `{ kind: "subsystem", id: "forge" }` — with an empty
      // receiver set, "Forge" would otherwise be dropped, silently orphaning the
      // rule's stored target. The closed trigger already shows the selected label.
      const wrapper = screen.getByTestId(HandoffRuleEditorTestId.Target);
      expect(within(wrapper).getByText("Forge")).toBeInTheDocument();
    });
  });

  describe("registry-driven signal picker (Slot B2)", () => {
    it("scopes the signal dropdown to kinds whose `from` matches fromSubsystemId, plus '*'", async () => {
      render(
        <HandoffRuleEditor
          fromSubsystemId="sentinel"
          onCancel={vi.fn()}
          onSave={vi.fn()}
          pipelines={pipelines}
          receiverSubsystemIds={receiverSubsystemIds}
          signalKinds={signalKinds}
          subsystemName="Sentinel"
          subsystems={subsystems}
        />,
      );
      const wrapper = screen.getByTestId(HandoffRuleEditorTestId.SignalKind);
      await userEvent.click(within(wrapper).getByTestId(DropdownTestId.Trigger));
      const panel = screen.getByTestId(DropdownTestId.Panel);
      expect(within(panel).getByText("Jakýkoli signál (∗)")).toBeInTheDocument();
      expect(within(panel).getByText("Zranitelnost (CVE)")).toBeInTheDocument();
      expect(within(panel).getByText("Únik tajného klíče")).toBeInTheDocument();
      expect(within(panel).getByText("Flaky Op Signal")).toBeInTheDocument();
      // "post-merge-red" is `from: "maestro"` — not sentinel's — so it's absent.
      expect(within(panel).queryByText("Červené CI po merge")).not.toBeInTheDocument();
    });

    it("shows a built-in kind's localized t() label", async () => {
      render(
        <HandoffRuleEditor
          fromSubsystemId="sentinel"
          onCancel={vi.fn()}
          onSave={vi.fn()}
          pipelines={pipelines}
          receiverSubsystemIds={receiverSubsystemIds}
          signalKinds={signalKinds}
          subsystemName="Sentinel"
          subsystems={subsystems}
        />,
      );
      const wrapper = screen.getByTestId(HandoffRuleEditorTestId.SignalKind);
      await userEvent.click(within(wrapper).getByTestId(DropdownTestId.Trigger));
      const panel = screen.getByTestId(DropdownTestId.Panel);
      // "cve" is a built-in — the localized cs label, not its raw `label` field.
      expect(within(panel).getByText("Zranitelnost (CVE)")).toBeInTheDocument();
    });

    it("shows an operator kind's stored label verbatim", async () => {
      render(
        <HandoffRuleEditor
          fromSubsystemId="sentinel"
          onCancel={vi.fn()}
          onSave={vi.fn()}
          pipelines={pipelines}
          receiverSubsystemIds={receiverSubsystemIds}
          signalKinds={signalKinds}
          subsystemName="Sentinel"
          subsystems={subsystems}
        />,
      );
      const wrapper = screen.getByTestId(HandoffRuleEditorTestId.SignalKind);
      await userEvent.click(within(wrapper).getByTestId(DropdownTestId.Trigger));
      const panel = screen.getByTestId(DropdownTestId.Panel);
      expect(within(panel).getByText("Flaky Op Signal")).toBeInTheDocument();
    });

    it("marks a pending kind with the pending-badge notice instead of its description", async () => {
      render(
        <HandoffRuleEditor
          fromSubsystemId="sentinel"
          onCancel={vi.fn()}
          onSave={vi.fn()}
          pipelines={pipelines}
          receiverSubsystemIds={receiverSubsystemIds}
          signalKinds={signalKinds}
          subsystemName="Sentinel"
          subsystems={subsystems}
        />,
      );
      const wrapper = screen.getByTestId(HandoffRuleEditorTestId.SignalKind);
      await userEvent.click(within(wrapper).getByTestId(DropdownTestId.Trigger));
      const panel = screen.getByTestId(DropdownTestId.Panel);
      expect(within(panel).getByText("Not Yet Emitted")).toBeInTheDocument();
      expect(within(panel).getByText("čeká na producenta")).toBeInTheDocument();
      expect(
        within(panel).queryByText("An operator-authored signal awaiting its producer."),
      ).not.toBeInTheDocument();
    });
  });
});
