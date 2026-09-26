import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { GraphIconButton, GraphIconButtonTestId } from "./GraphIconButton";

describe("GraphIconButton", () => {
  it("renders an accessible button and fires onClick", async () => {
    const onClick = vi.fn();
    render(
      <GraphIconButton aria-label="Disconnect" onClick={onClick}>
        x
      </GraphIconButton>,
    );
    const el = screen.getByTestId(GraphIconButtonTestId.Root);
    expect(el).toHaveRole("button");
    expect(el).toHaveAccessibleName("Disconnect");
    await userEvent.click(el);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("renders the step variant", () => {
    render(
      <GraphIconButton aria-label="Increase" variant="step">
        +
      </GraphIconButton>,
    );
    expect(screen.getByTestId(GraphIconButtonTestId.Root)).toHaveTextContent("+");
  });
});
