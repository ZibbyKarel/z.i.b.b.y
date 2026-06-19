import { createElement } from "react";
import { act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders as render, screen } from "../../../test/render";
import type { VoiceSession } from "../hooks/useVoiceSession";
import { VoiceScreen } from "./VoiceScreen";

// VoiceScreen is wired to live data + the unified composer; the session hook is
// unit-tested separately, so here we drive mode/transcript directly and assert
// the screen's projection of them.
const mockSession = vi.hoisted(() => ({ current: null as unknown as VoiceSession }));
// The dispatch bridge is unit-tested separately (parseUtterance + runVoiceAction +
// useUtteranceDispatch); here we mock it to assert the screen feeds it finalized
// transcripts and renders/speaks the ack it returns.
const dispatchMock = vi.hoisted(() => ({
  dispatch: vi.fn(),
  ack: null as { key: string; values?: Record<string, unknown> } | null,
}));
// TTS is unit-tested separately (useSpeech.test); here we mock it to assert the
// screen speaks acknowledgements aloud.
const speechMock = vi.hoisted(() => ({
  speak: vi.fn(),
  stop: vi.fn(),
  isSpeaking: false,
  isSupported: true,
  voices: [],
}));

vi.mock("../hooks/useVoiceSession", () => ({
  useVoiceSession: () => mockSession.current,
}));
const voiceDataMock = vi.hoisted(() => ({
  current: { approvals: [], liveRuns: [], recent: [], skills: [] } as {
    approvals: { id: string; skill: string; detail?: string }[];
    liveRuns: { runId: string }[];
    recent: { runId: string; owner: string; status: string }[];
    skills: unknown[];
  },
}));
vi.mock("../hooks/useVoiceData", () => ({
  useVoiceData: () => voiceDataMock.current,
}));
vi.mock("../hooks/useUtteranceDispatch", () => ({
  useUtteranceDispatch: () => dispatchMock,
}));
vi.mock("../hooks/useSpeech", () => ({
  useSpeech: () => speechMock,
}));
vi.mock("next/image", () => ({
  default: ({ alt, ...rest }: { alt?: string } & Record<string, unknown>) =>
    createElement("img", { alt: alt ?? "", ...rest }),
}));

function liveSession(over: Partial<VoiceSession> = {}): VoiceSession {
  return {
    mode: "live",
    state: "listening",
    isActive: true,
    revealed: false,
    transcript: "",
    interim: "",
    isSupported: true,
    error: null,
    toggleMic: vi.fn(),
    ...over,
  };
}

describe("VoiceScreen", () => {
  beforeEach(() => {
    dispatchMock.dispatch.mockClear();
    dispatchMock.ack = null;
    speechMock.speak.mockClear();
    speechMock.stop.mockClear();
    speechMock.isSpeaking = false;
    voiceDataMock.current = { approvals: [], liveRuns: [], recent: [], skills: [] };
  });

  it("dispatches a finalized live utterance to the command bridge", () => {
    mockSession.current = liveSession({ transcript: "schválit" });
    render(<VoiceScreen onExit={vi.fn()} />);
    expect(dispatchMock.dispatch).toHaveBeenCalledWith("schválit");
  });

  it("renders the acknowledgement of the last command", () => {
    dispatchMock.ack = { key: "approved" };
    mockSession.current = liveSession({ transcript: "schválit" });
    render(<VoiceScreen onExit={vi.fn()} />);
    expect(screen.getByText("Schváleno.")).toBeInTheDocument();
  });

  it("speaks the acknowledgement aloud (cs locale)", () => {
    dispatchMock.ack = { key: "approved" };
    mockSession.current = liveSession({ transcript: "schválit" });
    render(<VoiceScreen onExit={vi.fn()} />);
    expect(speechMock.speak).toHaveBeenCalledWith("Schváleno.", "cs-CZ");
  });

  it("the speaker button mutes ZIBBY's voice", () => {
    mockSession.current = liveSession();
    render(<VoiceScreen onExit={vi.fn()} />);
    const muteBtn = screen.getByTitle("Ztlumit hlas ZIBBYho");
    expect(muteBtn).toHaveAttribute("aria-pressed", "false");
    act(() => muteBtn.click());
    expect(speechMock.stop).toHaveBeenCalled();
    expect(screen.getByTitle("Zapnout hlas ZIBBYho")).toHaveAttribute("aria-pressed", "true");
  });

  it("speaks the briefing on demand (brief me)", () => {
    voiceDataMock.current = {
      approvals: [{ id: "a1", skill: "Kodér", detail: "deploy" }],
      liveRuns: [{ runId: "r1" }],
      recent: [],
      skills: [],
    };
    mockSession.current = liveSession();
    render(<VoiceScreen onExit={vi.fn()} />);
    act(() => screen.getByText("Briefing").click());
    expect(speechMock.speak).toHaveBeenCalledTimes(1);
    const [text, lang] = speechMock.speak.mock.calls[0] as [string, string];
    expect(text).toContain("1 agentů");
    expect(text).toContain("Kodér");
    expect(lang).toBe("cs-CZ");
  });

  it("does NOT auto-announce a run finishing while voice is open (status is pull)", () => {
    // Open with a still-running run; nothing should be spoken unprompted.
    voiceDataMock.current = {
      approvals: [],
      liveRuns: [{ runId: "r9" }],
      recent: [{ runId: "r9", owner: "Tester", status: "running" }],
      skills: [],
    };
    mockSession.current = liveSession();
    const { rerender } = render(<VoiceScreen onExit={vi.fn()} />);
    expect(speechMock.speak).not.toHaveBeenCalled();

    // r9 transitions to done while voice is open → the operator is NOT pushed a log.
    voiceDataMock.current = {
      approvals: [],
      liveRuns: [],
      recent: [{ runId: "r9", owner: "Tester", status: "done" }],
      skills: [],
    };
    act(() => rerender(<VoiceScreen onExit={vi.fn()} />));
    expect(speechMock.speak).not.toHaveBeenCalled();
  });

  it("renders the live spoken transcript", () => {
    mockSession.current = liveSession({ transcript: "run the tests" });
    render(<VoiceScreen onExit={vi.fn()} />);
    expect(screen.getByText("run the tests")).toBeInTheDocument();
  });

  it("the Send button dispatches the real transcript directly — no composer, no exit", () => {
    const onExit = vi.fn();
    mockSession.current = liveSession({ transcript: "deploy the app" });
    render(<VoiceScreen onExit={onExit} />);

    // Ignore the auto-dispatch on mount; assert the button's own dispatch.
    dispatchMock.dispatch.mockClear();
    const sendBtn = screen.getByText("Spustit").closest("button");
    expect(sendBtn).not.toBeDisabled();
    sendBtn?.click();
    expect(dispatchMock.dispatch).toHaveBeenCalledWith("deploy the app");
    // Dispatch keeps the overlay open (the run surfaces in the live HUD panels).
    expect(onExit).not.toHaveBeenCalled();
  });

  it("disables Send until something is spoken", () => {
    mockSession.current = liveSession({ transcript: "", state: "idle", isActive: false });
    render(<VoiceScreen onExit={vi.fn()} />);
    const sendBtn = screen.getByText("Spustit").closest("button");
    expect(sendBtn).toBeDisabled();
  });

  it("shows the optimistic 'heard' ack on screen but does NOT speak it", () => {
    dispatchMock.ack = { key: "dispatching", values: { task: "nasaď build" } };
    mockSession.current = liveSession({ transcript: "nasaď build" });
    render(<VoiceScreen onExit={vi.fn()} />);
    expect(screen.getByText("Slyším: nasaď build")).toBeInTheDocument();
    expect(speechMock.speak).not.toHaveBeenCalled();
  });

  it("speaks the clarify follow-up question aloud", () => {
    dispatchMock.ack = { key: "clarify", values: { options: "Kodér, Delivery" } };
    mockSession.current = liveSession({ transcript: "udělej to" });
    render(<VoiceScreen onExit={vi.fn()} />);
    expect(speechMock.speak).toHaveBeenCalledWith(
      "Nejsem si jistý — můžeš upřesnit? Třeba: Kodér, Delivery.",
      "cs-CZ",
    );
  });

  it("shows interim ghost text while listening", () => {
    mockSession.current = liveSession({ interim: "run the te" });
    render(<VoiceScreen onExit={vi.fn()} />);
    expect(screen.getByText("run the te")).toBeInTheDocument();
  });

  it("notes when live recognition is unavailable", () => {
    mockSession.current = liveSession({
      mode: "demo",
      isSupported: false,
      isActive: false,
      state: "idle",
    });
    render(<VoiceScreen onExit={vi.fn()} />);
    expect(screen.getByText(/prohlížeči/i)).toBeInTheDocument();
  });
});
