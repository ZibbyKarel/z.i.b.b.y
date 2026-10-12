import { renderWithProviders as render, screen } from "../../../test/render";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CodeBlockTestId } from "@zibby/design-system";

// RunLogStream tails a run via `useRunLog` (SSE-preferring, offset-poll fallback).
// Stub it so the test drives the render off a fixed `{ text, done }` without a backend.
const { useRunLogMock } = vi.hoisted(() => ({
  useRunLogMock: vi.fn(() => ({ text: "", done: false })),
}));
vi.mock("../useRunLog", () => ({ useRunLog: useRunLogMock }));
const { useStageMock } = vi.hoisted(() => ({
  useStageMock: vi.fn<(runId: string, phaseId: string | null) => { text: string; done: boolean }>(
    () => ({
      text: "",
      done: false,
    }),
  ),
}));
vi.mock("../useRunLogStream", () => ({ useStageRunLogStream: useStageMock }));

import { RunLogStream } from "./RunLogStream";

const baseProps = {
  runId: "run_1",
  liveLabel: "ŽIVÝ LOG",
  logLabel: "LOG BĚHU",
  linesLabel: (n: number) => `${n} řádků`,
} as const;

describe("RunLogStream (54) — log rendered in the DS CodeBlock", () => {
  beforeEach(() => {
    useRunLogMock.mockReset();
    useRunLogMock.mockReturnValue({ text: "", done: false });
  });

  it("tails the stage log (not the run log) when phaseId is set", () => {
    useStageMock.mockReturnValue({ text: "stage out", done: false });
    render(<RunLogStream {...baseProps} live phaseId="kodér" />);
    expect(useStageMock).toHaveBeenCalledWith("run_1", "kodér");
    expect(useRunLogMock).toHaveBeenCalledWith(null);
    expect(screen.getByTestId(CodeBlockTestId.Root)).toHaveTextContent("stage out");
  });

  it("renders the streamed log inside the CodeBlock framed monospace block", () => {
    useRunLogMock.mockReturnValue({ text: "line one\nline two\n", done: true });
    render(<RunLogStream {...baseProps} live={false} />);

    const pre = screen.getByTestId(CodeBlockTestId.Pre);
    expect(pre).toHaveTextContent("line one");
    expect(pre).toHaveTextContent("line two");
  });

  it("shows the live caret while streaming and drops it once the run is done", () => {
    useRunLogMock.mockReturnValue({ text: "working…", done: false });
    const { rerender } = render(<RunLogStream {...baseProps} live />);
    expect(screen.getByTestId(CodeBlockTestId.Caret)).toBeInTheDocument();

    useRunLogMock.mockReturnValue({ text: "working…", done: true });
    rerender(<RunLogStream {...baseProps} live />);
    expect(screen.queryByTestId(CodeBlockTestId.Caret)).not.toBeInTheDocument();
  });

  it("labels the streamed line count (trailing newline not counted)", () => {
    useRunLogMock.mockReturnValue({ text: "a\nb\nc\n", done: true });
    render(<RunLogStream {...baseProps} live={false} />);
    expect(screen.getByText("3 řádků")).toBeInTheDocument();
  });

  it("shows the live label as the CodeBlock placeholder while the log is empty", () => {
    useRunLogMock.mockReturnValue({ text: "", done: false });
    render(<RunLogStream {...baseProps} live />);
    expect(screen.getByTestId(CodeBlockTestId.Placeholder)).toHaveTextContent("ŽIVÝ LOG…");
  });

  it("renders the progress footer only when a pct is supplied", () => {
    useRunLogMock.mockReturnValue({ text: "x", done: false });
    const { rerender } = render(<RunLogStream {...baseProps} live pct={42} />);
    expect(screen.getByText("42%")).toBeInTheDocument();

    rerender(<RunLogStream {...baseProps} live />);
    expect(screen.queryByText("42%")).not.toBeInTheDocument();
  });
});
