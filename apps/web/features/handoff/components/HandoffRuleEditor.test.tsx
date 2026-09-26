import type { HandoffRule, HandoffSignalKind } from "@zibby/contracts";
import { DropdownTestId } from "@zibby/design-system";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders as render, screen, within } from "../../../test/render";
import { HandoffRuleEditor, HandoffRuleEditorTestId } from "./HandoffRuleEditor";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const departments = [
  { id: "dev", name: "Dev" },
  { id: "sec", name: "Security" },
];
const pipelines = [{ id: "hotfix", name: "Hotfix" }];
const receiverDepartmentIds = ["dev", "sec"];

const signalKinds: HandoffSignalKind[] = [
  {
    id: "cve",
    from: "sec",
    label: "Vulnerability (CVE)",
    description: "A vulnerability found in a project dependency.",
    severityBearing: true,
    status: "builtin",
    system: true,
  },
  {
    id: "secret",
    from: "sec",
    label: "Leaked secret",
    description: "A secret key or password leaked in code.",
    severityBearing: true,
    status: "builtin",
    system: true,
  },
  {
    id: "post-merge-red",
    from: "rel",
    label: "Red CI after merge",
    description: "CI failed after a PR was merged.",
    severityBearing: true,
    status: "builtin",
    system: true,
  },
  {
    id: "flaky-op-signal",
    from: "sec",
    label: "Flaky Op Signal",
    description: "Operator-authored signal for security.",
    severityBearing: false,
    status: "active",
  },
  {
    id: "not-yet-emitted",
    from: "sec",
    label: "Not Yet Emitted",
    description: "An operator-authored signal awaiting its producer.",
    severityBearing: false,
    status: "pending",
  },
];

const existingRule: HandoffRule = {
  id: "hr-1",
  from: "sec",
  signalKind: "cve",
  minSeverity: "high",
  to: { kind: "department", id: "dev" },
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

  it("\"+ nový signál\" is the signal picker's last option and NAVIGATES to /signals/new with the drawer's from prefilled, without changing the selected signal kind", async () => {
    const onSave = vi.fn();
    render(
      <HandoffRuleEditor
        departmentName="Security"
        departments={departments}
        fromDepartmentId="sec"
        onCancel={vi.fn()}
        onSave={onSave}
        pipelines={pipelines}
        receiverDepartmentIds={receiverDepartmentIds}
        signalKinds={signalKinds}
      />,
    );
    await pick(HandoffRuleEditorTestId.SignalKind, "+ nový signál");
    expect(push).toHaveBeenCalledWith("/signals/new?from=sec");
    // Navigating away must not corrupt the rule being edited — the signal kind
    // stays at its prior value (the first producer kind, "cve").
    await userEvent.click(screen.getByTestId(HandoffRuleEditorTestId.Save));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ signalKind: "cve" }));
  });

  it("renders the sentence with the department name", () => {
    render(
      <HandoffRuleEditor
        departmentName="Security"
        departments={departments}
        fromDepartmentId="sec"
        onCancel={vi.fn()}
        onSave={vi.fn()}
        pipelines={pipelines}
        receiverDepartmentIds={receiverDepartmentIds}
        signalKinds={signalKinds}
      />,
    );
    expect(screen.getByTestId(HandoffRuleEditorTestId.Root)).toBeInTheDocument();
    expect(screen.getByText("Když Security vyprodukuje")).toBeInTheDocument();
  });

  it("Save is disabled when there is no target (no departments/pipelines available)", () => {
    render(
      <HandoffRuleEditor
        departmentName="Security"
        departments={[]}
        fromDepartmentId="sec"
        onCancel={vi.fn()}
        onSave={vi.fn()}
        pipelines={[]}
        receiverDepartmentIds={[]}
        signalKinds={signalKinds}
      />,
    );
    expect(screen.getByTestId(HandoffRuleEditorTestId.Save)).toBeDisabled();
  });

  it("Cancel calls onCancel", async () => {
    const onCancel = vi.fn();
    render(
      <HandoffRuleEditor
        departmentName="Security"
        departments={departments}
        fromDepartmentId="sec"
        onCancel={onCancel}
        onSave={vi.fn()}
        pipelines={pipelines}
        receiverDepartmentIds={receiverDepartmentIds}
        signalKinds={signalKinds}
      />,
    );
    await userEvent.click(screen.getByTestId(HandoffRuleEditorTestId.Cancel));
    expect(onCancel).toHaveBeenCalled();
  });

  it("defaults to a known signal kind, department target and tier 2 for a new rule, and saves it", async () => {
    const onSave = vi.fn();
    render(
      <HandoffRuleEditor
        departmentName="Security"
        departments={departments}
        fromDepartmentId="sec"
        onCancel={vi.fn()}
        onSave={onSave}
        pipelines={pipelines}
        receiverDepartmentIds={receiverDepartmentIds}
        signalKinds={signalKinds}
      />,
    );
    await userEvent.click(screen.getByTestId(HandoffRuleEditorTestId.Save));
    expect(onSave).toHaveBeenCalledWith({
      from: "sec",
      signalKind: "cve",
      to: { kind: "department", id: "dev" },
      tier: 2,
      enabled: true,
    });
  });

  it("selecting the any-signal option saves signalKind '*'", async () => {
    const onSave = vi.fn();
    render(
      <HandoffRuleEditor
        departmentName="Security"
        departments={departments}
        fromDepartmentId="sec"
        onCancel={vi.fn()}
        onSave={onSave}
        pipelines={pipelines}
        receiverDepartmentIds={receiverDepartmentIds}
        signalKinds={signalKinds}
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
        departmentName="Security"
        departments={departments}
        fromDepartmentId="sec"
        onCancel={vi.fn()}
        onSave={onSave}
        pipelines={pipelines}
        receiverDepartmentIds={receiverDepartmentIds}
        signalKinds={signalKinds}
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
        departmentName="Security"
        departments={departments}
        fromDepartmentId="sec"
        onCancel={vi.fn()}
        onSave={onSave}
        pipelines={pipelines}
        receiverDepartmentIds={receiverDepartmentIds}
        signalKinds={signalKinds}
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
        departmentName="Security"
        departments={departments}
        fromDepartmentId="sec"
        onCancel={vi.fn()}
        onSave={onSave}
        pipelines={pipelines}
        receiverDepartmentIds={receiverDepartmentIds}
        signalKinds={signalKinds}
      />,
    );
    await pick(HandoffRuleEditorTestId.Target, "Hotfix");
    await userEvent.click(screen.getByTestId(HandoffRuleEditorTestId.Save));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ to: { kind: "pipeline", id: "hotfix" } }),
    );
  });

  it("picking a department target splits into { kind: 'department', id }", async () => {
    const onSave = vi.fn();
    render(
      <HandoffRuleEditor
        departmentName="Security"
        departments={departments}
        fromDepartmentId="sec"
        onCancel={vi.fn()}
        onSave={onSave}
        pipelines={pipelines}
        receiverDepartmentIds={receiverDepartmentIds}
        signalKinds={signalKinds}
      />,
    );
    await pick(HandoffRuleEditorTestId.Target, "Dev");
    await userEvent.click(screen.getByTestId(HandoffRuleEditorTestId.Save));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ to: { kind: "department", id: "dev" } }),
    );
  });

  it("changing the tier clause saves the numeric tier", async () => {
    const onSave = vi.fn();
    render(
      <HandoffRuleEditor
        departmentName="Security"
        departments={departments}
        fromDepartmentId="sec"
        onCancel={vi.fn()}
        onSave={onSave}
        pipelines={pipelines}
        receiverDepartmentIds={receiverDepartmentIds}
        signalKinds={signalKinds}
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
        departmentName="Security"
        departments={departments}
        fromDepartmentId="sec"
        initial={existingRule}
        onCancel={vi.fn()}
        onSave={onSave}
        pipelines={pipelines}
        receiverDepartmentIds={receiverDepartmentIds}
        signalKinds={signalKinds}
      />,
    );
    await userEvent.click(screen.getByTestId(HandoffRuleEditorTestId.Save));
    expect(onSave).toHaveBeenCalledWith({
      from: "sec",
      signalKind: "cve",
      minSeverity: "high",
      to: { kind: "department", id: "dev" },
      tier: 2,
      enabled: true,
    });
  });

  describe("receiver-scoped target (Slot A)", () => {
    it("omits a department with no pipeline/agent (not in receiverDepartmentIds) from the target dropdown", async () => {
      render(
        <HandoffRuleEditor
          departmentName="Security"
          departments={departments}
          fromDepartmentId="sec"
          onCancel={vi.fn()}
          onSave={vi.fn()}
          pipelines={pipelines}
          receiverDepartmentIds={["dev"]}
          signalKinds={signalKinds}
        />,
      );
      const wrapper = screen.getByTestId(HandoffRuleEditorTestId.Target);
      await userEvent.click(within(wrapper).getByTestId(DropdownTestId.Trigger));
      const panel = screen.getByTestId(DropdownTestId.Panel);
      expect(within(panel).queryByText("Security")).not.toBeInTheDocument();
      expect(within(panel).getByText("Dev")).toBeInTheDocument();
    });

    it("includes a department in receiverDepartmentIds in the target dropdown", async () => {
      render(
        <HandoffRuleEditor
          departmentName="Security"
          departments={departments}
          fromDepartmentId="sec"
          onCancel={vi.fn()}
          onSave={vi.fn()}
          pipelines={pipelines}
          receiverDepartmentIds={["dev", "sec"]}
          signalKinds={signalKinds}
        />,
      );
      const wrapper = screen.getByTestId(HandoffRuleEditorTestId.Target);
      await userEvent.click(within(wrapper).getByTestId(DropdownTestId.Trigger));
      const panel = screen.getByTestId(DropdownTestId.Panel);
      expect(within(panel).getByText("Security")).toBeInTheDocument();
    });

    it("always shows pipelines in the target dropdown regardless of receiverDepartmentIds", async () => {
      render(
        <HandoffRuleEditor
          departmentName="Security"
          departments={departments}
          fromDepartmentId="sec"
          onCancel={vi.fn()}
          onSave={vi.fn()}
          pipelines={pipelines}
          receiverDepartmentIds={[]}
          signalKinds={signalKinds}
        />,
      );
      const wrapper = screen.getByTestId(HandoffRuleEditorTestId.Target);
      await userEvent.click(within(wrapper).getByTestId(DropdownTestId.Trigger));
      const panel = screen.getByTestId(DropdownTestId.Panel);
      expect(within(panel).getByText("Hotfix")).toBeInTheDocument();
    });

    it("preserves the currently-edited rule's non-receiver target department as a visible, selected option", () => {
      render(
        <HandoffRuleEditor
          departmentName="Security"
          departments={departments}
          fromDepartmentId="sec"
          initial={existingRule}
          onCancel={vi.fn()}
          onSave={vi.fn()}
          pipelines={pipelines}
          receiverDepartmentIds={[]}
          signalKinds={signalKinds}
        />,
      );
      // `existingRule.to` is `{ kind: "department", id: "dev" }` — with an empty
      // receiver set, "Dev" would otherwise be dropped, silently orphaning the
      // rule's stored target. The closed trigger already shows the selected label.
      const wrapper = screen.getByTestId(HandoffRuleEditorTestId.Target);
      expect(within(wrapper).getByText("Dev")).toBeInTheDocument();
    });
  });

  describe("registry-driven signal picker (Slot B2)", () => {
    it("scopes the signal dropdown to kinds whose `from` matches fromDepartmentId, plus '*'", async () => {
      render(
        <HandoffRuleEditor
          departmentName="Security"
          departments={departments}
          fromDepartmentId="sec"
          onCancel={vi.fn()}
          onSave={vi.fn()}
          pipelines={pipelines}
          receiverDepartmentIds={receiverDepartmentIds}
          signalKinds={signalKinds}
        />,
      );
      const wrapper = screen.getByTestId(HandoffRuleEditorTestId.SignalKind);
      await userEvent.click(within(wrapper).getByTestId(DropdownTestId.Trigger));
      const panel = screen.getByTestId(DropdownTestId.Panel);
      expect(within(panel).getByText("Jakýkoli signál (∗)")).toBeInTheDocument();
      expect(within(panel).getByText("Zranitelnost (CVE)")).toBeInTheDocument();
      expect(within(panel).getByText("Únik tajného klíče")).toBeInTheDocument();
      expect(within(panel).getByText("Flaky Op Signal")).toBeInTheDocument();
      // "post-merge-red" is `from: "rel"` — not security's — so it's absent.
      expect(within(panel).queryByText("Červené CI po merge")).not.toBeInTheDocument();
    });

    it("shows a built-in kind's localized t() label", async () => {
      render(
        <HandoffRuleEditor
          departmentName="Security"
          departments={departments}
          fromDepartmentId="sec"
          onCancel={vi.fn()}
          onSave={vi.fn()}
          pipelines={pipelines}
          receiverDepartmentIds={receiverDepartmentIds}
          signalKinds={signalKinds}
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
          departmentName="Security"
          departments={departments}
          fromDepartmentId="sec"
          onCancel={vi.fn()}
          onSave={vi.fn()}
          pipelines={pipelines}
          receiverDepartmentIds={receiverDepartmentIds}
          signalKinds={signalKinds}
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
          departmentName="Security"
          departments={departments}
          fromDepartmentId="sec"
          onCancel={vi.fn()}
          onSave={vi.fn()}
          pipelines={pipelines}
          receiverDepartmentIds={receiverDepartmentIds}
          signalKinds={signalKinds}
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
