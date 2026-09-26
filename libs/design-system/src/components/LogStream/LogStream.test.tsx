import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LogStream, LogStreamTestId } from "./LogStream";
import type { LogStreamLine } from "./LogStream";

const LINES: LogStreamLine[] = [
  { id: "l1", ts: "14:02:01", source: "DEV", text: "Kodér opened a branch." },
  { id: "l2", ts: "14:02:07", source: "DEV", state: "working", text: "Running tests…" },
];

describe("LogStream", () => {
  it("renders one line per entry", () => {
    render(<LogStream lines={LINES} />);
    expect(screen.getByTestId(`${LogStreamTestId.Line}-l1`)).toHaveTextContent(
      "Kodér opened a branch.",
    );
    expect(screen.getByTestId(`${LogStreamTestId.Line}-l2`)).toHaveTextContent("Running tests…");
  });

  it("shows a blinking caret only on the newest line", () => {
    render(<LogStream lines={LINES} />);
    expect(screen.getByTestId(LogStreamTestId.Caret)).toBeInTheDocument();
    expect(
      screen
        .getByTestId(`${LogStreamTestId.Line}-l1`)
        .querySelector('[data-testid="log-stream-caret"]'),
    ).not.toBeInTheDocument();
  });

  it("freezes the caret animation when paused", () => {
    render(<LogStream paused lines={LINES} />);
    expect(screen.getByTestId(LogStreamTestId.Caret)).toHaveStyle({ animation: "none" });
  });

  it("caps rendered lines to max, keeping the most recent", () => {
    render(<LogStream lines={LINES} max={1} />);
    expect(screen.queryByTestId(`${LogStreamTestId.Line}-l1`)).not.toBeInTheDocument();
    expect(screen.getByTestId(`${LogStreamTestId.Line}-l2`)).toBeInTheDocument();
  });

  it("renders an empty message when there are no lines", () => {
    render(<LogStream lines={[]} />);
    expect(screen.getByTestId(LogStreamTestId.Empty)).toBeInTheDocument();
  });
});
