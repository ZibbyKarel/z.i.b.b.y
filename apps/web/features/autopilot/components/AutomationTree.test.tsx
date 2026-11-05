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

  it("a company toggle different from global writes an override", async () => {
    const onChange = setup({ ...empty, companies: { shoptet: { autoImplement: true } } });
    await userEvent.click(within(toggle("company:shoptet", "autoReview")).getByRole("switch"));
    expect(onChange).toHaveBeenCalledWith({
      ...empty,
      companies: { shoptet: { autoImplement: true, autoReview: true } },
    });
  });

  it("setting a company toggle back to the parent value removes the override", async () => {
    const onChange = setup({ ...empty, companies: { shoptet: { autoReview: true } } });
    await userEvent.click(within(toggle("company:shoptet", "autoReview")).getByRole("switch"));
    expect(onChange).toHaveBeenCalledWith(empty);
  });

  it("toggles are the four autopilot keys, small below global", () => {
    setup({ ...empty, companies: { shoptet: { autoReview: true } } });
    const keys = (node: string) =>
      within(row(node) as HTMLElement)
        .getAllByTestId(AutomationTreeTestId.Toggle)
        .map((el) => el.getAttribute("data-key"));
    const all = ["autoReview", "autoAddressComments", "autoImplement", "autoCommunicate"];
    expect(keys("global")).toEqual(all);
    expect(keys("company:shoptet")).toEqual(all);
  });

  it("an override deep in the tree expands every node down to it", () => {
    setup({ ...empty, teams: { devrel: { autoReview: true } } });
    expect(toggle("company:shoptet", "autoReview")).toHaveAttribute("data-overridden", "false");
    expect(toggle("team:devrel", "autoReview")).toHaveAttribute("data-overridden", "true");
    expect(toggle("team:devrel", "autoReview")).toHaveAttribute("data-effective", "true");
  });

  it("a node shows the inherited effective value", () => {
    setup({
      ...empty,
      global: { ...NO_AUTOMATION, autoReview: true },
      companies: { shoptet: { autoImplement: true } },
    });
    expect(toggle("company:shoptet", "autoReview")).toHaveAttribute("data-effective", "true");
    expect(toggle("company:shoptet", "autoCommunicate")).toHaveAttribute("data-effective", "false");
  });

  it("nodes without overrides are collapsed; expanding shows toggles and teams", async () => {
    setup();
    expect(row("team:devrel")).toBeUndefined();
    expect(
      within(row("company:shoptet") as HTMLElement).queryAllByTestId(AutomationTreeTestId.Toggle),
    ).toHaveLength(0);
    await userEvent.click(
      within(row("company:shoptet") as HTMLElement).getAllByTestId(
        AutomationTreeTestId.Expand,
      )[0] as HTMLElement,
    );
    expect(row("team:devrel")).toBeDefined();
    expect(toggle("company:shoptet", "autoReview")).toBeDefined();
  });

  it("teams without a (known) company are top-level", () => {
    setup();
    expect(row("team:solo")).toBeDefined();
    expect(row("team:lost")).toBeDefined();
  });
});
