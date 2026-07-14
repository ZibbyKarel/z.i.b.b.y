import { fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders as render, screen } from "../../../test/render";
import type { RunView } from "../../runs/run";
import { ChatTaskRow, ChatTaskRowTestId } from "./ChatTaskRow";

function run(overrides: Partial<RunView>): RunView {
  const base: RunView = {
    runId: "r_1",
    kind: "agent",
    owner: "writer",
    status: "running",
    pct: null,
    title: "",
    prompt: "",
    project: "",
    startedAt: new Date().toISOString(),
    logBase: "agents",
  };
  return { ...base, ...overrides };
}

describe("ChatTaskRow (Phase 100: selects instead of navigating)", () => {
  it("renders a button (not a link) that calls onSelect with the run's id on click", () => {
    const onSelect = vi.fn();
    render(
      <ChatTaskRow
        glyph="bot"
        onSelect={onSelect}
        openAria="Open run: Fix login bug"
        run={run({ runId: "run_a", title: "Fix login bug" })}
        selected={false}
        stateLabel="Running"
      />,
    );

    const row = screen.getByTestId(ChatTaskRowTestId.Row);
    expect(row.tagName).toBe("BUTTON");
    expect(row).not.toHaveAttribute("href");

    fireEvent.click(row);
    expect(onSelect).toHaveBeenCalledWith("run_a");
  });

  it("keeps the accessible name on the button", () => {
    render(
      <ChatTaskRow
        glyph="bot"
        onSelect={vi.fn()}
        openAria="Open run: Fix login bug"
        run={run({ runId: "run_a", title: "Fix login bug" })}
        selected={false}
        stateLabel="Running"
      />,
    );

    expect(screen.getByTestId(ChatTaskRowTestId.Row)).toHaveAccessibleName(
      "Open run: Fix login bug",
    );
  });

  it("reads its `selected` prop as the card's selected/highlighted state", () => {
    render(
      <ChatTaskRow
        selected
        glyph="bot"
        onSelect={vi.fn()}
        openAria="Open run: Fix login bug"
        run={run({ runId: "run_a", title: "Fix login bug" })}
        stateLabel="Running"
      />,
    );

    // The DS `Card` `selected` prop drives the accent border/ring via a class —
    // asserted through the class rather than a role, since "selected" isn't its
    // own ARIA state on a plain button here (no `aria-pressed` contract exists
    // for this row; ChatTasksPanel is the only reader of which row is open).
    expect(screen.getByTestId(ChatTaskRowTestId.Row).className).toContain("border-accent");
  });

  it("shows the meta row always and a progress meter only when the run carries pct", () => {
    const { rerender } = render(
      <ChatTaskRow
        glyph="bot"
        onSelect={vi.fn()}
        openAria="Open run: Fix login bug"
        run={run({ runId: "run_a", title: "Fix login bug", pct: 74 })}
        selected={false}
        stateLabel="Running"
      />,
    );
    expect(screen.getByTestId(ChatTaskRowTestId.Meta)).toBeInTheDocument();
    expect(screen.getByTestId(ChatTaskRowTestId.Progress)).toHaveTextContent("74%");

    rerender(
      <ChatTaskRow
        glyph="bot"
        onSelect={vi.fn()}
        openAria="Open run: Fix login bug"
        run={run({ runId: "run_a", title: "Fix login bug", pct: null })}
        selected={false}
        stateLabel="Running"
      />,
    );
    expect(screen.queryByTestId(ChatTaskRowTestId.Progress)).toBeNull();
  });
});
