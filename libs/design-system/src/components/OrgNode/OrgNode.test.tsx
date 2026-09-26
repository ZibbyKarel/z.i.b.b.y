import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { StateTone } from "../../stateTone";
import { OrgNode, OrgNodeTestId } from "./OrgNode";

const CELLS: StateTone[] = ["working", "working", "idle"];

describe("OrgNode", () => {
  it("renders code, agent count and name", () => {
    render(<OrgNode cells={CELLS} code="DEV" name="Development" />);
    expect(screen.getByTestId(OrgNodeTestId.Code)).toHaveTextContent("DEV");
    expect(screen.getByTestId(OrgNodeTestId.Count)).toHaveTextContent("3");
    expect(screen.getByTestId(OrgNodeTestId.Name)).toHaveTextContent("Development");
  });

  it("renders a cell strip", () => {
    render(<OrgNode cells={CELLS} code="DEV" name="Development" />);
    expect(screen.getByTestId(OrgNodeTestId.Cells)).toBeInTheDocument();
  });

  it("renders the alert line only when provided", () => {
    const { rerender } = render(<OrgNode cells={CELLS} code="DEV" name="Development" />);
    expect(screen.queryByTestId(OrgNodeTestId.Alert)).not.toBeInTheDocument();
    rerender(
      <OrgNode
        alert={{ state: "blocked", label: "2 blocked" }}
        cells={CELLS}
        code="DEV"
        name="Development"
      />,
    );
    expect(screen.getByTestId(OrgNodeTestId.Alert)).toHaveTextContent("2 blocked");
  });

  it("renders as an anchor when href is given", () => {
    render(<OrgNode cells={CELLS} code="DEV" href="/org/dept/dev" name="Development" />);
    expect(screen.getByTestId(OrgNodeTestId.Root).tagName).toBe("A");
    expect(screen.getByTestId(OrgNodeTestId.Root)).toHaveAttribute("href", "/org/dept/dev");
  });

  it("renders as a button and fires onClick when href is omitted", async () => {
    const onClick = vi.fn();
    render(<OrgNode cells={CELLS} code="DEV" name="Development" onClick={onClick} />);
    const root = screen.getByTestId(OrgNodeTestId.Root);
    expect(root.tagName).toBe("BUTTON");
    await userEvent.click(root);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("renders as a static div when neither href nor onClick is given", () => {
    render(<OrgNode cells={CELLS} code="DEV" name="Development" />);
    expect(screen.getByTestId(OrgNodeTestId.Root).tagName).toBe("DIV");
  });

  it("marks the border as selected", () => {
    render(<OrgNode selected cells={CELLS} code="DEV" name="Development" />);
    expect(screen.getByTestId(OrgNodeTestId.Root)).toHaveClass("border-ink");
  });
});
