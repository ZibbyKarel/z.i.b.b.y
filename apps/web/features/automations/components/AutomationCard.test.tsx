import { renderWithProviders as render, screen } from "../../../test/render";
import { describe, expect, it } from "vitest";
import type { Automation } from "@zibby/contracts";
import { AutomationCard } from "./AutomationCard";

const base: Automation = {
  id: "daily-brief",
  name: "Daily briefing",
  trigger: { type: "cron", expr: "0 9 * * *" },
  target: { type: "briefing" },
  enabled: true,
};

const noop = () => {};
const renderCard = (over: Partial<Automation>) =>
  render(
    <AutomationCard
      automation={{ ...base, ...over }}
      onEdit={noop}
      onToggle={noop}
      onTrigger={noop}
    />,
  );

describe("AutomationCard (38) — honest next-run", () => {
  it("shows a next-run time for an enabled cron automation", () => {
    renderCard({ enabled: true });
    // "příště {when}" (cs)
    expect(screen.getByText(/příště/)).toBeInTheDocument();
  });

  it("shows 'off · won't run' for a disabled automation — not a phantom next-run", () => {
    renderCard({ enabled: false });
    expect(screen.getByText("vypnuto · nepoběží")).toBeInTheDocument();
    expect(screen.queryByText(/příště/)).not.toBeInTheDocument();
  });
});
