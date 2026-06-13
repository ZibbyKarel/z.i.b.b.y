import { describe, expect, it } from "vitest";
import { renderWithProviders as render, screen } from "../../test/render";
import { VoiceProvider, useVoice } from "../voice";
import { NewTaskProvider, useNewTask } from "./TaskContext";

/**
 * Phase 11.4 provider nesting: the voice takeover (rendered by VoiceProvider) must
 * be able to reach `useNewTask().open(transcript)`. That requires NewTaskProvider to
 * sit ABOVE VoiceProvider — the order AppShell now uses. This guard renders that
 * nesting and proves a component inside VoiceProvider can consume both contexts
 * without throwing (the "must be used within …Provider" error).
 */
function Probe() {
  const { open } = useNewTask();
  const { toggle } = useVoice();
  return (
    <button onClick={() => { toggle(); open("from voice"); }} type="button">
      probe
    </button>
  );
}

describe("voice → task seam (provider nesting)", () => {
  it("useNewTask is reachable from inside VoiceProvider when nested under NewTaskProvider", () => {
    expect(() =>
      render(
        <NewTaskProvider>
          <VoiceProvider>
            <Probe />
          </VoiceProvider>
        </NewTaskProvider>,
      ),
    ).not.toThrow();
    expect(screen.getByRole("button", { name: "probe" })).toBeInTheDocument();
  });
});
