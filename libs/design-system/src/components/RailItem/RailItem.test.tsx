import { createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RailItem, RailItemTestId } from "./RailItem";

describe("RailItem", () => {
  it("renders title, leading and meta", () => {
    render(<RailItem leading="L" meta="RUNNING · 01:02" title="1 · Plan" />);
    expect(screen.getByTestId(RailItemTestId.Title)).toHaveTextContent("1 · Plan");
    expect(screen.getByTestId(RailItemTestId.Leading)).toHaveTextContent("L");
    expect(screen.getByTestId(RailItemTestId.Meta)).toHaveTextContent("RUNNING");
  });

  it("marks the selected row with aria-current", () => {
    render(<RailItem selected title="x" />);
    expect(screen.getByTestId(RailItemTestId.Root)).toHaveAttribute("aria-current", "true");
  });

  it("has no aria-current when not selected", () => {
    render(<RailItem title="x" />);
    expect(screen.getByTestId(RailItemTestId.Root)).not.toHaveAttribute("aria-current");
  });

  it("omits the meta row without meta", () => {
    render(<RailItem title="x" />);
    expect(screen.queryByTestId(RailItemTestId.Meta)).toBeNull();
  });

  it("fires onClick and forwards ref", () => {
    const onClick = vi.fn();
    const ref = createRef<HTMLButtonElement>();
    render(<RailItem onClick={onClick} ref={ref} title="x" />);
    fireEvent.click(screen.getByTestId(RailItemTestId.Root));
    expect(onClick).toHaveBeenCalledOnce();
    expect(ref.current).toBe(screen.getByTestId(RailItemTestId.Root));
  });
});
