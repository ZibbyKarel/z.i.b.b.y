import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { render } from "../../utils/testRender";
import { PipelineChips, PipelineChipsTestId } from "./PipelineChips";

describe("PipelineChips", () => {
  it("renders a chip per stage; idle is dimmed", () => {
    render(
      <PipelineChips
        chips={[
          { code: "DEV", state: "working", title: "Dev" },
          { code: "QA", state: "idle" },
        ]}
      />,
    );
    expect(screen.getByTestId(`${PipelineChipsTestId.Chip}-0`)).toHaveTextContent("DEV");
    expect(screen.getByTestId(`${PipelineChipsTestId.Chip}-0`)).toHaveAttribute("title", "Dev");
    expect(screen.getByTestId(`${PipelineChipsTestId.Chip}-0`)).toHaveClass("text-ink");
    expect(screen.getByTestId(`${PipelineChipsTestId.Chip}-1`)).toHaveClass("text-ink-3");
  });
});
