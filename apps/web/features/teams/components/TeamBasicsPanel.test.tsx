import userEvent from "@testing-library/user-event";
import { DropdownTestId } from "@zibby/design-system";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders as render, screen } from "../../../test/render";
import { TeamBasicsPanel } from "./TeamBasicsPanel";

vi.mock("../../companies", () => ({
  useCompaniesQuery: () => ({ data: [{ id: "acme", name: "Acme Corp" }] }),
}));

describe("TeamBasicsPanel", () => {
  it("disables save until a name is entered", () => {
    render(<TeamBasicsPanel isNew onSave={vi.fn()} />);
    expect(screen.getByTestId("save-basics")).toBeDisabled();
  });

  it("creates a team from name + desc", async () => {
    const onSave = vi.fn();
    render(<TeamBasicsPanel isNew onSave={onSave} />);

    await userEvent.type(screen.getByPlaceholderText("Platforma"), "Growth");
    await userEvent.type(screen.getByPlaceholderText("Čím se tým zabývá"), "Acquisition");
    await userEvent.click(screen.getByTestId("save-basics"));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Growth", desc: "Acquisition", companyId: null }),
    );
  });

  it("prefills fields from the existing team", () => {
    render(
      <TeamBasicsPanel
        isNew={false}
        onSave={vi.fn()}
        team={{ id: "platform", name: "Platform", desc: "Core infra", companyId: "acme" }}
      />,
    );
    expect(screen.getByDisplayValue("Platform")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Core infra")).toBeInTheDocument();
  });

  it("saves the picked company id", async () => {
    const onSave = vi.fn();
    render(<TeamBasicsPanel isNew onSave={onSave} />);

    await userEvent.type(screen.getByPlaceholderText("Platforma"), "Growth");
    await userEvent.click(screen.getByTestId(DropdownTestId.Trigger));
    const options = screen.getAllByTestId(DropdownTestId.Option);
    const acme = options.find((o) => o.textContent === "Acme Corp");
    await userEvent.click(acme!);
    await userEvent.click(screen.getByTestId("save-basics"));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ companyId: "acme" }));
  });

  it("sends companyId: null when an existing team's company is cleared", async () => {
    const onSave = vi.fn();
    render(
      <TeamBasicsPanel
        isNew={false}
        onSave={onSave}
        team={{ id: "platform", name: "Platform", companyId: "acme" }}
      />,
    );

    await userEvent.click(screen.getByTestId(DropdownTestId.Trigger));
    const options = screen.getAllByTestId(DropdownTestId.Option);
    const none = options.find((o) => o.textContent === "Bez firmy");
    await userEvent.click(none!);
    await userEvent.click(screen.getByTestId("save-basics"));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ companyId: null }));
  });

  it("shows a delete button for an existing team but not for a new one", () => {
    const { rerender } = render(<TeamBasicsPanel isNew onSave={vi.fn()} />);
    expect(screen.queryByTestId("delete-team")).not.toBeInTheDocument();

    rerender(
      <TeamBasicsPanel
        isNew={false}
        onDelete={vi.fn()}
        onSave={vi.fn()}
        team={{ id: "platform", name: "Platform" }}
      />,
    );
    expect(screen.getByTestId("delete-team")).toBeInTheDocument();
  });
});
