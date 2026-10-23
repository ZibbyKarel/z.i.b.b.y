import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { PageActions, PageActionsSlotProvider } from "./PageActions";

describe("PageActions", () => {
  it("renders inline without a provider", () => {
    render(
      <PageActions>
        <button type="button">Act</button>
      </PageActions>,
    );
    expect(screen.getByRole("button", { name: "Act" })).toBeInTheDocument();
  });

  it("portals into the slot", () => {
    const slot = document.createElement("div");
    document.body.appendChild(slot);
    render(
      <PageActionsSlotProvider element={slot}>
        <div data-testid="inline">
          <PageActions>
            <button type="button">Act</button>
          </PageActions>
        </div>
      </PageActionsSlotProvider>,
    );
    expect(within(slot).getByRole("button", { name: "Act" })).toBeInTheDocument();
    expect(within(screen.getByTestId("inline")).queryByRole("button")).toBeNull();
  });

  it("renders nothing (no inline flash) in the shell until the slot element is set", () => {
    render(
      <PageActionsSlotProvider element={null}>
        <PageActions>
          <button type="button">Act</button>
        </PageActions>
      </PageActionsSlotProvider>,
    );
    expect(screen.queryByRole("button")).toBeNull();
  });
});
