import { afterEach, describe, expect, it } from "vitest";
import { getPreferredVoiceURI, setPreferredVoiceURI } from "./voicePreference";

describe("voicePreference", () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it("is unset (auto) by default", () => {
    expect(getPreferredVoiceURI()).toBeNull();
  });

  it("round-trips a chosen voiceURI", () => {
    setPreferredVoiceURI("cs-local");
    expect(getPreferredVoiceURI()).toBe("cs-local");
  });

  it("clears back to auto on null or empty", () => {
    setPreferredVoiceURI("en-remote");
    setPreferredVoiceURI(null);
    expect(getPreferredVoiceURI()).toBeNull();

    setPreferredVoiceURI("en-remote");
    setPreferredVoiceURI("");
    expect(getPreferredVoiceURI()).toBeNull();
  });
});
