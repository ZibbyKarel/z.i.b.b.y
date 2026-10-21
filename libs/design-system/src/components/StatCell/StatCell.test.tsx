import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { render } from "../../utils/testRender";
import { StatCell, StatCellGrid, StatCellTestId } from "./StatCell";

describe("StatCell", () => {
  it("renders only the provided lines with a tone bottom border", () => {
    render(
      <StatCellGrid>
        <StatCell label="CHECKS" tone="working" value="3 / 4" />
      </StatCellGrid>,
    );
    expect(screen.getByTestId(StatCellTestId.Label)).toHaveTextContent("CHECKS");
    expect(screen.getByTestId(StatCellTestId.Value)).toHaveTextContent("3 / 4");
    expect(screen.queryByTestId(StatCellTestId.Title)).toBeNull();
    expect(screen.getByTestId(StatCellTestId.Root).className).toContain("border-b-state-work");
  });

  it("renders chain lines and the fit grid", () => {
    render(
      <StatCellGrid columns="fit">
        <StatCell filled label="01 · ENG" meta="STEP 1" status="WORKING" title="Engineering" />
      </StatCellGrid>,
    );
    expect(screen.getByTestId(StatCellTestId.Grid).className).toContain("minmax(150px");
    expect(screen.getByTestId(StatCellTestId.Title)).toHaveTextContent("Engineering");
    expect(screen.getByTestId(StatCellTestId.Meta)).toHaveTextContent("STEP 1");
    expect(screen.getByTestId(StatCellTestId.Status)).toHaveTextContent("WORKING");
    expect(screen.getByTestId(StatCellTestId.Root).className).toContain("bg-bg");
  });
});
