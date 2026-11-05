import userEvent from "@testing-library/user-event";
import { type AutopilotAutomation, type Company, NO_AUTOMATION, type Team } from "@zibby/contracts";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders as render, screen, within } from "../../../test/render";
import { AutomationTree, AutomationTreeTestId } from "./AutomationTree";

const companies = [{ id: "shoptet", name: "Shoptet" }] as Company[];
const teams = [
  { id: "devrel", name: "DevRel", companyId: "shoptet" },
  { id: "solo", name: "Solo" },
  { id: "lost", name: "Lost", companyId: "gone" },
] as Team[];
const empty: AutopilotAutomation = { global: { ...NO_AUTOMATION }, companies: {}, teams: {} };

const row = (node: string) =>
  screen
    .getAllByTestId(AutomationTreeTestId.Node)
    .find((el) => el.getAttribute("data-node") === node);
const toggle = (node: string, key: string) =>
  within(row(node) as HTMLElement)
    .getAllByTestId(AutomationTreeTestId.Toggle)
    .find((el) => el.getAttribute("data-key") === key) as HTMLElement;

function setup(value: AutopilotAutomation = empty) {
  const onChange = vi.fn();
  render(<AutomationTree companies={companies} onChange={onChange} teams={teams} value={value} />);
  return onChange;
}

describe("AutomationTree", () => {
  it("global switch emits the new value", async () => {
    const onChange = setup();
    await userEvent.click(within(toggle("global", "autoImplement")).getByRole("switch"));
    expect(onChange).toHaveBeenCalledWith({
      ...empty,
      global: { ...NO_AUTOMATION, autoImplement: true },
    });
  });

  it("company Off writes the override, Inherit removes the company key", async () => {
    const onChange = setup();
    await userEvent.click(
      within(toggle("company:shoptet", "autoReview")).getByTestId("segmented-control-item-off"),
    );
    expect(onChange).toHaveBeenCalledWith({
      ...empty,
      companies: { shoptet: { autoReview: false } },
    });

    onChange.mockClear();
    document.body.innerHTML = "";
    const onChange2 = setup({ ...empty, companies: { shoptet: { autoReview: false } } });
    await userEvent.click(
      within(toggle("company:shoptet", "autoReview")).getByTestId("segmented-control-item-inherit"),
    );
    expect(onChange2).toHaveBeenCalledWith(empty);
  });

  it("inherit shows the inherited effective value", () => {
    setup({ ...empty, global: { ...NO_AUTOMATION, autoReview: true } });
    expect(toggle("company:shoptet", "autoReview")).toHaveAttribute("data-effective", "true");
    expect(toggle("company:shoptet", "autoImplement")).toHaveAttribute("data-effective", "false");
  });

  it("companies are collapsed; expanding shows their teams", async () => {
    setup();
    expect(row("team:devrel")).toBeUndefined();
    await userEvent.click(
      within(row("company:shoptet") as HTMLElement).getByTestId(AutomationTreeTestId.Expand),
    );
    expect(row("team:devrel")).toBeDefined();
  });

  it("teams without a (known) company are top-level", () => {
    setup();
    expect(row("team:solo")).toBeDefined();
    expect(row("team:lost")).toBeDefined();
  });
});
