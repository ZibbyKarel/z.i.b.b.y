import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders as render, screen } from "../../../test/render";
import { CompanyBasicsPanel } from "./CompanyBasicsPanel";

describe("CompanyBasicsPanel", () => {
  it("disables save until a name is entered", () => {
    render(<CompanyBasicsPanel isNew onSave={vi.fn()} />);
    expect(screen.getByTestId("save-basics")).toBeDisabled();
  });

  it("creates a company from name + desc", async () => {
    const onSave = vi.fn();
    render(<CompanyBasicsPanel isNew onSave={onSave} />);

    await userEvent.type(screen.getByPlaceholderText("Acme s.r.o."), "Acme");
    await userEvent.type(screen.getByPlaceholderText("Čím se firma zabývá"), "Klient");
    await userEvent.click(screen.getByTestId("save-basics"));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Acme", desc: "Klient", budget: undefined }),
    );
  });

  it("prefills fields from the existing company", () => {
    render(
      <CompanyBasicsPanel
        company={{ id: "acme", name: "Acme", desc: "Klient", budget: { dailyCostCapUsd: 5 } }}
        isNew={false}
        onSave={vi.fn()}
      />,
    );
    expect(screen.getByDisplayValue("Acme")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Klient")).toBeInTheDocument();
    expect(screen.getByLabelText("$ / den")).toHaveValue("5");
  });

  it("saves the default budget fields alongside the run caps", async () => {
    const onSave = vi.fn();
    render(<CompanyBasicsPanel isNew onSave={onSave} />);

    await userEvent.type(screen.getByPlaceholderText("Acme s.r.o."), "Acme");
    await userEvent.type(screen.getByLabelText("běhů / den"), "3");
    await userEvent.type(screen.getByLabelText("$ / týden"), "20");
    await userEvent.click(screen.getByTestId("save-basics"));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        budget: expect.objectContaining({ dailyRuns: 3, weeklyCostCapUsd: 20 }),
      }),
    );
  });

  it("shows a delete button for an existing company but not for a new one", () => {
    const { rerender } = render(<CompanyBasicsPanel isNew onSave={vi.fn()} />);
    expect(screen.queryByTestId("delete-company")).not.toBeInTheDocument();

    rerender(
      <CompanyBasicsPanel
        company={{ id: "acme", name: "Acme" }}
        isNew={false}
        onDelete={vi.fn()}
        onSave={vi.fn()}
      />,
    );
    expect(screen.getByTestId("delete-company")).toBeInTheDocument();
  });
});
