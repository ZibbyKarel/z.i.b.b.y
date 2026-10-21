import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { render } from "../../utils/testRender";
import { CommandBar, CommandBarGroup, CommandBarTestId, CommandBarText } from "./CommandBar";

describe("CommandBar", () => {
  it("renders title, subtitle and controls", () => {
    render(
      <CommandBar subtitle="/ BRIDGE" title="ZIBBYCORP">
        <CommandBarGroup>
          <CommandBarText faint>LAYOUT</CommandBarText>
          <CommandBarText>THU 24 SEP · 14:32</CommandBarText>
        </CommandBarGroup>
      </CommandBar>,
    );
    expect(screen.getByTestId(CommandBarTestId.Root)).toHaveRole("banner");
    expect(screen.getByTestId(CommandBarTestId.Title)).toHaveTextContent("ZIBBYCORP");
    expect(screen.getByTestId(CommandBarTestId.Subtitle)).toHaveTextContent("/ BRIDGE");
    expect(screen.getAllByTestId(CommandBarTestId.Text)).toHaveLength(2);
  });

  it("omits the subtitle when not given", () => {
    render(<CommandBar title="X" />);
    expect(screen.queryByTestId(CommandBarTestId.Subtitle)).toBeNull();
  });
});
