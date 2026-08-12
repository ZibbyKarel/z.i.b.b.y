import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { render } from "../../utils/testRender";
import { Tooltip, TooltipTestId } from "./Tooltip";

describe("Tooltip", () => {
  it("hides the bubble until the trigger is hovered", async () => {
    render(
      <Tooltip content="Explains the field">
        <button type="button">?</button>
      </Tooltip>,
    );
    expect(screen.queryByTestId(TooltipTestId.Content)).toBeNull();

    await userEvent.hover(screen.getByTestId(TooltipTestId.Root));
    const bubble = screen.getByTestId(TooltipTestId.Content);
    expect(bubble).toHaveRole("tooltip");
    expect(bubble).toHaveTextContent("Explains the field");
  });

  it("shows on keyboard focus and wires aria-describedby to the trigger", async () => {
    render(
      <Tooltip content="Keyboard reachable">
        <button type="button">?</button>
      </Tooltip>,
    );
    await userEvent.tab();
    const trigger = screen.getByRole("button");
    const bubble = screen.getByTestId(TooltipTestId.Content);
    expect(trigger).toHaveAttribute("aria-describedby", bubble.id);
  });

  it("hides again on blur", async () => {
    render(
      <Tooltip content="x">
        <button type="button">?</button>
      </Tooltip>,
    );
    await userEvent.tab();
    expect(screen.getByTestId(TooltipTestId.Content)).toBeInTheDocument();
    await userEvent.tab();
    expect(screen.queryByTestId(TooltipTestId.Content)).toBeNull();
  });

  it("dismisses the bubble on Escape while keeping focus on the trigger", async () => {
    render(
      <Tooltip content="x">
        <button type="button">?</button>
      </Tooltip>,
    );
    await userEvent.tab();
    const trigger = screen.getByRole("button");
    expect(screen.getByTestId(TooltipTestId.Content)).toBeInTheDocument();

    await userEvent.keyboard("{Escape}");
    expect(screen.queryByTestId(TooltipTestId.Content)).toBeNull();
    expect(trigger).toHaveFocus();
  });
});
