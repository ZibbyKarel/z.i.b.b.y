import type { Automation } from "@zibby/contracts";
import { AnchoredSheetTestId } from "@zibby/design-system";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen, within } from "../../../../test/render";
import { AutomationSheet, AutomationSheetTestId } from "./AutomationSheet";

const d = vi.hoisted(() => ({ trigger: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: d.push }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));
const automation: Automation = {
  id: "nightly",
  name: "Nightly review",
  trigger: { type: "cron", expr: "0 3 * * *" },
  target: { type: "agent", agentId: "reviewer" },
  prompt: "Review yesterday's PRs",
  enabled: true,
  system: false,
};

vi.mock("../../../automations/queries", () => ({
  useAutomationsQuery: () => ({ data: [automation] }),
}));
vi.mock("../../../automations/mutations", () => ({
  useTriggerAutomationMutation: () => ({ mutate: d.trigger, isPending: false }),
}));

const anchor = {
  left: 0,
  width: 400,
  top: 0,
  height: 400,
  eL: 0,
  eT: 0,
  eH: 0,
  side: "r",
} as never;

describe("AutomationSheet", () => {
  it("shows the automation detail and runs it now", async () => {
    renderWithProviders(<AutomationSheet anchor={anchor} id="nightly" onClose={vi.fn()} />);
    expect(screen.getByTestId(AnchoredSheetTestId.Title)).toHaveTextContent("Nightly review");
    expect(screen.getByTestId(AutomationSheetTestId.Schedule)).toHaveTextContent("Denně v 03:00");
    expect(screen.getByTestId(AutomationSheetTestId.Prompt)).toHaveTextContent(
      "Review yesterday's PRs",
    );
    await userEvent.click(screen.getByTestId(AutomationSheetTestId.RunNow));
    expect(d.trigger).toHaveBeenCalledWith({ params: { id: "nightly" }, body: {} });
  });

  it("the title opens the automation detail page", async () => {
    renderWithProviders(<AutomationSheet anchor={anchor} id="nightly" onClose={vi.fn()} />);
    await userEvent.click(
      within(screen.getByTestId(AnchoredSheetTestId.Title)).getByRole("button"),
    );
    expect(d.push).toHaveBeenCalledWith("/work/automations/nightly");
  });

  it("renders nothing for an unknown id", () => {
    renderWithProviders(<AutomationSheet anchor={anchor} id="gone" onClose={vi.fn()} />);
    expect(screen.queryByTestId(AnchoredSheetTestId.Root)).toBeNull();
  });
});
