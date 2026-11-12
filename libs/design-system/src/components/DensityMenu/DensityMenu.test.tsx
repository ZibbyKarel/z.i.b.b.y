import { screen } from "@testing-library/react";
import { Dialog, DialogTestId } from "../Dialog/Dialog";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { render } from "../../utils/testRender";
import { DensityMenu, DensityMenuTestId } from "./DensityMenu";

const labels = { compact: "COMPACT", comfort: "COMFORT", airy: "AIRY", open: "OPEN" };

describe("DensityMenu", () => {
  it("is closed until the trigger is clicked, then lists all four densities", async () => {
    render(<DensityMenu label="Density" labels={labels} onChange={vi.fn()} value="airy" />);
    expect(screen.queryByTestId(DensityMenuTestId.Menu)).toBeNull();
    await userEvent.click(screen.getByTestId(DensityMenuTestId.Trigger));
    expect(screen.getByTestId(DensityMenuTestId.Menu)).toHaveRole("listbox");
    expect(screen.getAllByRole("option")).toHaveLength(4);
    expect(screen.getByTestId(`${DensityMenuTestId.Option}-airy`)).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("calls onChange and closes on selection", async () => {
    const onChange = vi.fn();
    render(<DensityMenu label="Density" labels={labels} onChange={onChange} value="airy" />);
    await userEvent.click(screen.getByTestId(DensityMenuTestId.Trigger));
    await userEvent.click(screen.getByTestId(`${DensityMenuTestId.Option}-compact`));
    expect(onChange).toHaveBeenCalledWith("compact");
    expect(screen.queryByTestId(DensityMenuTestId.Menu)).toBeNull();
  });

  it("closes on Escape", async () => {
    render(<DensityMenu label="Density" labels={labels} onChange={vi.fn()} value="airy" />);
    await userEvent.click(screen.getByTestId(DensityMenuTestId.Trigger));
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByTestId(DensityMenuTestId.Menu)).toBeNull();
  });
});

describe("DensityMenu outside dismiss (todo-12)", () => {
  it("closes on a pointerdown on the dialog body without closing the dialog", async () => {
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} title="T">
        <DensityMenu label="Density" labels={labels} onChange={vi.fn()} value="airy" />
      </Dialog>,
    );
    await userEvent.click(screen.getByTestId(DensityMenuTestId.Trigger));
    await userEvent.click(screen.getByTestId(DialogTestId.Body));
    expect(screen.queryByTestId(DensityMenuTestId.Menu)).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes when the trigger is clicked while open", async () => {
    render(<DensityMenu label="Density" labels={labels} onChange={vi.fn()} value="airy" />);
    await userEvent.click(screen.getByTestId(DensityMenuTestId.Trigger));
    await userEvent.click(screen.getByTestId(DensityMenuTestId.Trigger));
    expect(screen.queryByTestId(DensityMenuTestId.Menu)).toBeNull();
  });
});
