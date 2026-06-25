import { renderWithProviders as render, screen } from "../../../test/render";
import { describe, expect, it } from "vitest";
import { MarkdownTestId } from "@zibby/design-system";
import { RunTranscript, RunTranscriptTestId } from "./RunTranscript";

const TRANSCRIPT = [
  "▶ claude-sonnet-4-6",
  "Here is **bold** agent text.",
  "● Bash$ echo hi",
  "  ⎿ hi",
  "─── done in 1.0s",
].join("\n");

describe("RunTranscript", () => {
  it("renders agent text through the DS markdown view", () => {
    render(<RunTranscript live={false} text={TRANSCRIPT} />);
    expect(screen.getByTestId(MarkdownTestId.Root)).toBeInTheDocument();
  });

  it("renders tool and result segments as mono rows", () => {
    render(<RunTranscript live={false} text={TRANSCRIPT} />);
    expect(screen.getByTestId(RunTranscriptTestId.Tool)).toHaveTextContent("Bash$ echo hi");
    const result = screen.getByTestId(RunTranscriptTestId.Result);
    expect(result).toHaveTextContent("hi");
    expect(result).toHaveTextContent("⎿");
  });

  it("shows a live caret only while live", () => {
    const { rerender } = render(<RunTranscript live text={TRANSCRIPT} />);
    expect(screen.getByTestId(RunTranscriptTestId.Caret)).toBeInTheDocument();

    rerender(<RunTranscript live={false} text={TRANSCRIPT} />);
    expect(screen.queryByTestId(RunTranscriptTestId.Caret)).not.toBeInTheDocument();
  });

  it("renders stray HTML-like tokens in agent text as literal text (not swallowed)", () => {
    const { container } = render(
      <RunTranscript live={false} text={"Wrap it in <Suspense> for layout."} />,
    );
    expect(container.textContent).toContain("<Suspense>");
  });

  it("shows the placeholder while empty", () => {
    render(<RunTranscript live placeholder="waiting…" text="" />);
    expect(screen.getByTestId(RunTranscriptTestId.Placeholder)).toHaveTextContent("waiting…");
    expect(screen.queryByTestId(MarkdownTestId.Root)).not.toBeInTheDocument();
  });
});
