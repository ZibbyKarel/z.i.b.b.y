import { describe, expect, it } from "vitest";
import type { RunView } from "../../runs/run";
import { renderWithProviders, screen } from "../../../test/render";
import { FlyoutWorkRow, FlyoutWorkRowTestId } from "./FlyoutWorkRow";

function run(overrides: Partial<RunView> = {}): RunView {
  const base: RunView = {
    runId: "r_1",
    kind: "agent",
    owner: "writer",
    status: "running",
    pct: null,
    title: "Fix login bug",
    prompt: "",
    project: "acme",
    startedAt: new Date().toISOString(),
    logBase: "agents",
  };
  return { ...base, ...overrides };
}

describe("FlyoutWorkRow", () => {
  it("renders meta (owner + relative start) and the run title", () => {
    renderWithProviders(<FlyoutWorkRow glyph="bot" run={run()} />);
    expect(screen.getByTestId(FlyoutWorkRowTestId.Root)).toBeInTheDocument();
    expect(screen.getByTestId(FlyoutWorkRowTestId.Meta)).toHaveTextContent("writer");
    expect(screen.getByTestId(FlyoutWorkRowTestId.Root)).toHaveTextContent("Fix login bug");
  });

  it("shows the pct suffix only when the run carries pct", () => {
    const { rerender } = renderWithProviders(<FlyoutWorkRow glyph="bot" run={run({ pct: 74 })} />);
    expect(screen.getByTestId(FlyoutWorkRowTestId.Progress)).toHaveTextContent("74%");
    rerender(<FlyoutWorkRow glyph="bot" run={run({ pct: null })} />);
    expect(screen.queryByTestId(FlyoutWorkRowTestId.Progress)).toBeNull();
  });
});
