import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { GraphInlineInput, GraphInlineInputTestId } from "./GraphInlineInput";

describe("GraphInlineInput", () => {
  it("renders a ghost value by default", () => {
    render(<GraphInlineInput aria-label="Output file" onChange={() => {}} value="out.md" />);
    const el = screen.getByTestId(GraphInlineInputTestId.Root);
    expect(el).toHaveValue("out.md");
    expect(el).toHaveAccessibleName("Output file");
  });

  it("fires onChange", async () => {
    const onChange = vi.fn();
    render(<GraphInlineInput aria-label="Name" onChange={onChange} value="" />);
    await userEvent.type(screen.getByTestId(GraphInlineInputTestId.Root), "x");
    expect(onChange).toHaveBeenCalled();
  });

  it("renders the field variant with bold weight", () => {
    render(
      <GraphInlineInput
        aria-label="Pipeline name"
        onChange={() => {}}
        value="Deploy"
        variant="field"
        weight="bold"
      />,
    );
    expect(screen.getByTestId(GraphInlineInputTestId.Root)).toHaveValue("Deploy");
  });
});
