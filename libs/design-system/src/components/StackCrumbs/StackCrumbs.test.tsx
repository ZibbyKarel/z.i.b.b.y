import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { render } from "../../utils/testRender";
import { StackCrumbs, StackCrumbsTestId } from "./StackCrumbs";

describe("StackCrumbs", () => {
  it("renders crumbs with arrows between them and inverts the current one", () => {
    render(
      <StackCrumbs
        crumbs={[
          { id: "1", label: "#1", tone: "done" },
          { id: "2", label: "#2", tone: "working", current: true },
        ]}
        label="STACK"
      />,
    );
    expect(screen.getByTestId(StackCrumbsTestId.Label)).toHaveTextContent("STACK");
    expect(screen.getByTestId(`${StackCrumbsTestId.Crumb}-1`).className).toContain(
      "border-l-state-done",
    );
    expect(screen.getByTestId(`${StackCrumbsTestId.Crumb}-2`).className).toContain("bg-ink");
    expect(screen.getByTestId(StackCrumbsTestId.Root)).toHaveTextContent("#1→#2");
  });

  it("makes a crumb with onSelect a button; others stay plain", () => {
    const onSelect = vi.fn();
    render(
      <StackCrumbs
        crumbs={[
          { id: "1", label: "#1", onSelect },
          { id: "2", label: "#2", current: true },
        ]}
        label="STACK"
      />,
    );
    const link = screen.getByTestId(`${StackCrumbsTestId.Crumb}-1`);
    expect(link).toHaveRole("button");
    fireEvent.click(link);
    expect(onSelect).toHaveBeenCalledOnce();
    expect(screen.getByTestId(`${StackCrumbsTestId.Crumb}-2`)).not.toHaveRole("button");
    expect(screen.getByTestId(StackCrumbsTestId.Root).className).not.toContain("mx-[20px]");
  });
});
