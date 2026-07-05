import { renderWithProviders as render, screen } from "../../../test/render";
import { describe, expect, it } from "vitest";
import userEvent from "@testing-library/user-event";
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

  it("collapses a tool call's result by default, revealing it on click", async () => {
    const user = userEvent.setup();
    render(<RunTranscript live={false} text={TRANSCRIPT} />);

    const trigger = screen.getByTestId(RunTranscriptTestId.ToolCall);
    expect(trigger).toHaveTextContent("Bash$ echo hi");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId(RunTranscriptTestId.Result)).not.toBeInTheDocument();

    await user.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const result = screen.getByTestId(RunTranscriptTestId.Result);
    expect(result).toHaveTextContent("hi");
    expect(result).toHaveTextContent("⎿");

    await user.click(trigger);
    expect(screen.queryByTestId(RunTranscriptTestId.Result)).not.toBeInTheDocument();
  });

  it("renders a tool call with no result as a plain, non-clickable row", () => {
    render(<RunTranscript live={false} text="● Bash(pnpm test)" />);

    expect(screen.getByTestId(RunTranscriptTestId.Tool)).toHaveTextContent("Bash(pnpm test)");
    expect(screen.queryByTestId(RunTranscriptTestId.ToolCall)).not.toBeInTheDocument();
    expect(screen.queryByTestId(RunTranscriptTestId.ToolCaret)).not.toBeInTheDocument();
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
