import type { HandoffRule } from "@zibby/contracts";
import { DropdownTestId } from "@zibby/design-system";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders as render, screen, within } from "../../../test/render";
import { HandoffRuleEditor, HandoffRuleEditorTestId } from "./HandoffRuleEditor";

const subsystems = [
  { id: "forge", name: "Forge" },
  { id: "sentinel", name: "Sentinel" },
];
const pipelines = [{ id: "hotfix", name: "Hotfix" }];

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
  it("renders the sentence with the subsystem name", () => {
    render(
      <HandoffRuleEditor
        fromSubsystemId="sentinel"
        onCancel={vi.fn()}
        onSave={vi.fn()}
        pipelines={pipelines}
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
});
