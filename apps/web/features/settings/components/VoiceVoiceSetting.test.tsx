import { afterEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { renderWithProviders as render, screen } from "../../../test/render";
import { fixtureVoices } from "../../../test/speechSynthesisMock";
import { getPreferredVoiceURI } from "../../voice/voicePreference";
import { VoiceVoiceSetting } from "./VoiceVoiceSetting";

const speechMock = vi.hoisted(() => ({
  voices: [] as unknown[],
  isSupported: true,
  speak: vi.fn(),
  stop: vi.fn(),
  isSpeaking: false,
}));

vi.mock("../../voice/hooks/useSpeech", () => ({
  useSpeech: () => speechMock,
}));

describe("VoiceVoiceSetting", () => {
  afterEach(() => {
    window.localStorage.clear();
    speechMock.speak.mockClear();
    speechMock.isSupported = true;
    speechMock.voices = fixtureVoices();
  });

  it("persists the chosen voice", async () => {
    speechMock.voices = fixtureVoices();
    const user = userEvent.setup();
    render(<VoiceVoiceSetting lang="cs-CZ" />);

    // Open the dropdown and pick the Czech voice.
    await user.click(screen.getByRole("button", { name: "Hlas ZIBBYho" }));
    await user.click(await screen.findByText("Czech (local) (cs-CZ)"));

    expect(getPreferredVoiceURI()).toBe("cs-local");
  });

  it("plays a sample via the test button", () => {
    speechMock.voices = fixtureVoices();
    render(<VoiceVoiceSetting lang="en-US" />);
    screen.getByText("Test").closest("button")?.click();
    // The provider renders the cs catalog; `lang` only sets the spoken locale.
    expect(speechMock.speak).toHaveBeenCalledWith(
      "Ahoj, jsem ZIBBY. Takhle zním.",
      "en-US",
    );
  });

  it("degrades to a note when TTS is unsupported", () => {
    speechMock.isSupported = false;
    speechMock.voices = [];
    render(<VoiceVoiceSetting lang="cs-CZ" />);
    expect(
      screen.getByText(/nepodporuje hlasový výstup/i),
    ).toBeInTheDocument();
    expect(screen.queryByText("Test")).toBeNull();
  });
});
