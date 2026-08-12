import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { render } from "../../utils/testRender";
import { Button, ButtonTestId } from "./Button";

describe("Button", () => {
  it("renders its label", () => {
    render(<Button>Spustit</Button>);
    expect(screen.getByTestId(ButtonTestId.Root)).toHaveAccessibleName("Spustit");
  });

  it("fires onClick", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Spustit</Button>);
    await userEvent.click(screen.getByTestId(ButtonTestId.Root));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("renders a leading icon", () => {
    render(<Button icon="play">Spustit</Button>);
    expect(screen.getByTestId(ButtonTestId.Icon)).toBeInTheDocument();
  });

  it("does not fire when disabled", async () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Spustit
      </Button>,
    );
    await userEvent.click(screen.getByTestId(ButtonTestId.Root));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("carries the inert disabled affordance regardless of intent", () => {
    render(
      <Button disabled intent="primary">
        Spustit
      </Button>,
    );
    const root = screen.getByTestId(ButtonTestId.Root);
    expect(root).toBeDisabled();
    // Neutral, token-driven disabled look — not merely a faded accent fill.
    expect(root).toHaveClass(
      "disabled:cursor-not-allowed",
      "disabled:bg-elevated",
      "disabled:text-foreground-faint",
      "disabled:border-border",
    );
  });

  it("shows a spinner instead of the icon and suppresses clicks when loading", async () => {
    const onClick = vi.fn();
    render(
      <Button loading icon="play" onClick={onClick}>
        Spouštím
      </Button>,
    );
    expect(screen.getByTestId(ButtonTestId.Spinner)).toBeInTheDocument();
    expect(screen.queryByTestId(ButtonTestId.Icon)).toBeNull();
    expect(screen.getByTestId(ButtonTestId.Root)).toHaveAttribute("aria-busy", "true");
    await userEvent.click(screen.getByTestId(ButtonTestId.Root));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("defaults to type=button", () => {
    render(<Button>Spustit</Button>);
    expect(screen.getByTestId(ButtonTestId.Root)).toHaveAttribute("type", "button");
  });

  it("forwards a ref", () => {
    let node: HTMLButtonElement | null = null;
    render(
      <Button
        ref={(el) => {
          node = el;
        }}
      >
        Spustit
      </Button>,
    );
    expect(node).toBeInstanceOf(HTMLButtonElement);
  });
});
