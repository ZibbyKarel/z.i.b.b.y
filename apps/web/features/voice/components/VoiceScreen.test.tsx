import { createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders as render, screen } from "../../../test/render";
import type { VoiceSession } from "../hooks/useVoiceSession";
import { VoiceScreen } from "./VoiceScreen";

// VoiceScreen is wired to live data + the unified composer; the session hook is
// unit-tested separately, so here we drive mode/transcript directly and assert
// the screen's projection of them.
const mockSession = vi.hoisted(() => ({ current: null as unknown as VoiceSession }));
const openSpy = vi.hoisted(() => vi.fn());
// The dispatch bridge is unit-tested separately (parseUtterance + runVoiceAction);
// here we mock it to assert the screen feeds it finalized transcripts and renders
// the ack it returns.
const dispatchMock = vi.hoisted(() => ({
  dispatch: vi.fn(),
  ack: null as { key: string } | null,
}));

vi.mock("../hooks/useVoiceSession", () => ({
  useVoiceSession: () => mockSession.current,
}));
vi.mock("../hooks/useVoiceData", () => ({
  useVoiceData: () => ({ approvals: [], liveRuns: [], recent: [], skills: [] }),
}));
vi.mock("../hooks/useUtteranceDispatch", () => ({
  useUtteranceDispatch: () => dispatchMock,
}));
vi.mock("../../tasks", () => ({ useNewTask: () => ({ open: openSpy }) }));
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

  it("renders the live spoken transcript", () => {
    mockSession.current = liveSession({ transcript: "run the tests" });
    render(<VoiceScreen onExit={vi.fn()} />);
    expect(screen.getByText("run the tests")).toBeInTheDocument();
  });

  it("hands the real transcript to the composer", () => {
    openSpy.mockClear();
    const onExit = vi.fn();
    mockSession.current = liveSession({ transcript: "deploy the app" });
    render(<VoiceScreen onExit={onExit} />);

    const handBtn = screen.getByText("Nový task z tohoto").closest("button");
    expect(handBtn).not.toBeDisabled();
    handBtn?.click();
    expect(onExit).toHaveBeenCalled();
    expect(openSpy).toHaveBeenCalledWith("deploy the app");
  });

  it("disables hand-to-task until something is spoken", () => {
    mockSession.current = liveSession({ transcript: "", state: "idle", isActive: false });
    render(<VoiceScreen onExit={vi.fn()} />);
    const handBtn = screen.getByText("Nový task z tohoto").closest("button");
    expect(handBtn).toBeDisabled();
  });

  it("shows interim ghost text while listening", () => {
    mockSession.current = liveSession({ interim: "run the te" });
    render(<VoiceScreen onExit={vi.fn()} />);
    expect(screen.getByText("run the te")).toBeInTheDocument();
  });

  it("notes when live recognition is unavailable", () => {
    mockSession.current = liveSession({ mode: "demo", isSupported: false, isActive: false, state: "idle" });
    render(<VoiceScreen onExit={vi.fn()} />);
    expect(screen.getByText(/prohlížeči/i)).toBeInTheDocument();
  });
});
