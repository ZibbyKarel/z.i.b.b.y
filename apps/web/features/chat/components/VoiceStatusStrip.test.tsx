import { describe, expect, it } from "vitest";
import { renderWithProviders, screen } from "../../../test/render";
import { VoiceStatusStrip, VoiceStatusStripTestId } from "./VoiceStatusStrip";

describe("VoiceStatusStrip", () => {
  it("shows the listening label while the mic is live", () => {
    renderWithProviders(<VoiceStatusStrip listening interim="" />);
    expect(screen.getByTestId(VoiceStatusStripTestId.Root)).toHaveTextContent("POSLOUCHÁM");
  });

  it("shows the paused label when the mic is not live", () => {
    renderWithProviders(<VoiceStatusStrip interim="" listening={false} />);
    expect(screen.getByTestId(VoiceStatusStripTestId.Root)).toHaveTextContent("HLASOVÝ REŽIM");
  });

  it("renders the interim transcript when present", () => {
    renderWithProviders(<VoiceStatusStrip listening interim="oprav ten build" />);
    expect(screen.getByTestId(VoiceStatusStripTestId.Interim)).toHaveTextContent("oprav ten build");
  });

  it("omits the interim node when the transcript is blank", () => {
    renderWithProviders(<VoiceStatusStrip listening interim="   " />);
    expect(screen.queryByTestId(VoiceStatusStripTestId.Interim)).not.toBeInTheDocument();
  });
});
