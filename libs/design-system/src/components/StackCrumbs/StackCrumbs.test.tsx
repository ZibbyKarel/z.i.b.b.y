import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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
});
