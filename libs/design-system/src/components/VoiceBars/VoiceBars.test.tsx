import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { render } from "../../utils/testRender";
import { VoiceBars, VoiceBarsTestId } from "./VoiceBars";

describe("VoiceBars", () => {
  it("renders four decorative bars", () => {
    render(<VoiceBars />);
    expect(screen.getByTestId(VoiceBarsTestId.Root)).toHaveAttribute("aria-hidden", "true");
    expect(screen.getAllByTestId(VoiceBarsTestId.Bar)).toHaveLength(4);
  });
});
