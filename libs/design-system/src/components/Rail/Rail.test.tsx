import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { render } from "../../utils/testRender";
import { Rail, RailTestId } from "./Rail";

describe("Rail", () => {
  it("renders the default title", () => {
    render(<Rail />);
    expect(screen.getByTestId(RailTestId.Header)).toHaveTextContent("Needs you");
  });

  it("renders a custom title", () => {
    render(<Rail title="Waiting on you" />);
    expect(screen.getByTestId(RailTestId.Header)).toHaveTextContent("Waiting on you");
  });

  it("renders the count when provided", () => {
    render(<Rail count={3} />);
    expect(screen.getByTestId(RailTestId.Count)).toHaveTextContent("3");
  });

  it("omits the count when not provided", () => {
    render(<Rail />);
    expect(screen.queryByTestId(RailTestId.Count)).toBeNull();
  });

  it("renders children in the body", () => {
    render(
      <Rail>
        <div>Approval card one</div>
      </Rail>,
    );
    expect(screen.getByTestId(RailTestId.Body)).toHaveTextContent("Approval card one");
    expect(screen.queryByTestId(RailTestId.Empty)).toBeNull();
  });

  it("renders the empty slot when there are no children", () => {
    render(<Rail empty="Nothing is waiting for you." />);
    expect(screen.getByTestId(RailTestId.Empty)).toHaveTextContent("Nothing is waiting for you.");
  });

  it("renders the aside landmark", () => {
    render(<Rail />);
    expect(screen.getByTestId(RailTestId.Root)).toHaveRole("complementary");
  });

  describe("collapsible", () => {
    it("renders a toggle button header instead of the static SectionLabel", () => {
      render(<Rail collapsible open title="Pinned · 02" />);
      const toggle = screen.getByTestId(RailTestId.ToggleButton);
      expect(toggle).toHaveTextContent("Pinned · 02");
      expect(toggle).toHaveRole("button");
      expect(toggle).toHaveAttribute("aria-expanded", "true");
    });

    it("shows the body when open and hides it when closed", () => {
      const { rerender } = render(
        <Rail collapsible open>
          <div>Pinned row</div>
        </Rail>,
      );
      expect(screen.getByTestId(RailTestId.Body)).toHaveTextContent("Pinned row");

      rerender(
        <Rail collapsible open={false}>
          <div>Pinned row</div>
        </Rail>,
      );
      expect(screen.queryByTestId(RailTestId.Body)).toBeNull();
    });

    it("fires onToggle when the header button is activated", async () => {
      const onToggle = vi.fn();
      render(<Rail collapsible open onToggle={onToggle} />);
      await userEvent.click(screen.getByTestId(RailTestId.ToggleButton));
      expect(onToggle).toHaveBeenCalledTimes(1);
    });

    it("rotates the chevron based on open state", () => {
      const { rerender } = render(<Rail collapsible open />);
      expect(screen.getByTestId(RailTestId.Chevron)).toHaveStyle({ transform: "rotate(90deg)" });

      rerender(<Rail collapsible open={false} />);
      expect(screen.getByTestId(RailTestId.Chevron)).toHaveStyle({ transform: "rotate(0deg)" });
    });

    it("does not render the static count slot", () => {
      render(<Rail collapsible open count={3} title="Pinned" />);
      expect(screen.queryByTestId(RailTestId.Count)).toBeNull();
    });
  });
});
