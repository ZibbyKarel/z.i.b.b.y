import { renderWithProviders as render, screen } from "../../../test/render";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { Automation } from "@zibby/contracts";
import { AutomationFormTestId, useAutomationFormState } from "./AutomationFormFields";
import { TriggerFields } from "./TriggerFields";

const signalAutomation: Automation = {
  id: "sig",
  trigger: { type: "signal", kind: "cve", from: "sec", minSeverity: "high" },
  target: { type: "task", text: "fix" },
  enabled: true,
  system: false,
  approval: "ask",
};

const PROBE = "form-probe";

/** Renders the trigger fields plus a probe exposing what the form would persist. */
function Harness({ automation }: { automation?: Automation }) {
  const form = useAutomationFormState(automation);
  return (
    <>
      <TriggerFields form={form} />
      <span data-testid={PROBE}>
        {JSON.stringify({ trigger: form.buildTrigger(), approval: form.buildApproval() })}
      </span>
    </>
  );
}

const probe = () => JSON.parse(screen.getByTestId(PROBE).textContent ?? "{}") as unknown;

describe("TriggerFields — signal trigger", () => {
  it("seeds the signal trigger and the approval switch from the automation", () => {
    render(<Harness automation={signalAutomation} />);
    expect(probe()).toEqual({
      trigger: { type: "signal", kind: "cve", from: "sec", minSeverity: "high" },
      approval: "ask",
    });
    expect(screen.getByTestId(AutomationFormTestId.Approval)).toBeChecked();
  });

  it("toggling approval off persists as auto", async () => {
    render(<Harness automation={signalAutomation} />);
    await userEvent.click(screen.getByTestId(AutomationFormTestId.Approval));
    expect(probe()).toMatchObject({ approval: "auto" });
  });

  it("does not show the signal fields for a cron trigger", () => {
    render(<Harness />);
    expect(screen.queryByTestId(AutomationFormTestId.Approval)).not.toBeInTheDocument();
  });
});
