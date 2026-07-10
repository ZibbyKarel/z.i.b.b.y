import { renderWithProviders as render, screen } from "../../../test/render";
import { describe, expect, it } from "vitest";
import type { Automation } from "@zibby/contracts";
import { SystemAutomationRow, SystemAutomationRowTestId } from "./SystemAutomationRow";

const base: Automation = {
  id: "pattern-extract",
  name: "Noční extrakce vzorů",
  trigger: { type: "cron", expr: "0 3 * * *" },
  target: { type: "pattern-extract" },
  enabled: true,
  system: true,
};

const noop = () => {};
const renderRow = (over: Partial<Automation>) =>
  render(
    <SystemAutomationRow
      automation={{ ...base, ...over }}
      onEdit={noop}
      onToggle={noop}
      onTrigger={noop}
    />,
  );

describe("SystemAutomationRow", () => {
  it("shows the automation name and its schedule on one line, not the target", () => {
    renderRow({});
    expect(screen.getByText("Noční extrakce vzorů")).toBeInTheDocument();
    // "Denně v {time}" (cs) — the schedule, not a repeat of the target label.
    expect(screen.getByText(/Denně v/)).toBeInTheDocument();
  });

  it("shows a next-run time for an enabled cron automation", () => {
    renderRow({ enabled: true });
    expect(screen.getByText(/příště/)).toBeInTheDocument();
  });

  it("shows 'off · won't run' for a disabled automation — not a phantom next-run", () => {
    renderRow({ enabled: false });
    expect(screen.getByText("vypnuto · nepoběží")).toBeInTheDocument();
    expect(screen.queryByText(/příště/)).not.toBeInTheDocument();
  });

  it("leaves the enable toggle interactive", () => {
    renderRow({});
    expect(screen.getByTestId(SystemAutomationRowTestId.Toggle)).not.toBeDisabled();
  });
});
