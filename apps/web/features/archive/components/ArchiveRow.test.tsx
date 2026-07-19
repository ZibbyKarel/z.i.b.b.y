import { renderWithProviders as render, screen } from "../../../test/render";
import { fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { RunView } from "../../runs/run";
import { ArchiveRow, ArchiveRowTestId } from "./ArchiveRow";

function run(overrides: Partial<RunView> = {}): RunView {
  return {
    runId: "r_1",
    kind: "pipeline",
    owner: "delivery",
    status: "done",
    pct: null,
    title: "Ship the release",
    prompt: "",
    project: "billing-svc",
    startedAt: new Date().toISOString(),
    logBase: null,
    ...overrides,
  };
}

describe("ArchiveRow", () => {
  it("renders the title and the '{subsystem} · {project}' subline", () => {
    render(
      <ArchiveRow
        active={false}
        durationLabel="18m"
        onSelect={vi.fn()}
        run={run()}
        subsystemColor="#5b8def"
        subsystemName="Forge"
      />,
    );

    expect(screen.getByText("Ship the release")).toBeInTheDocument();
    expect(screen.getByText("Forge · billing-svc")).toBeInTheDocument();
    expect(screen.getByText("18m")).toBeInTheDocument();
  });

  it("shows the 'bez subsystému' subline as plain text when there is no subsystem colour", () => {
    render(
      <ArchiveRow
        active={false}
        durationLabel=""
        onSelect={vi.fn()}
        run={run({ kind: "agent", owner: "writer" })}
        subsystemName="Bez subsystému"
      />,
    );

    expect(screen.getByText("Bez subsystému · billing-svc")).toBeInTheDocument();
    const dot = screen.getByTestId(ArchiveRowTestId.Dot);
    expect(dot).toHaveStyle({ background: "var(--color-foreground-faint)" });
  });

  it("fires onSelect with the run's id when clicked", () => {
    const onSelect = vi.fn();
    render(
      <ArchiveRow
        active={false}
        durationLabel=""
        onSelect={onSelect}
        run={run({ runId: "run-42" })}
        subsystemColor="#5b8def"
        subsystemName="Forge"
      />,
    );

    fireEvent.click(screen.getByTestId(ArchiveRowTestId.Root));
    expect(onSelect).toHaveBeenCalledWith("run-42");
  });

  it("hue-tints the row when active and a subsystem colour is set", () => {
    render(
      <ArchiveRow
        active
        durationLabel=""
        onSelect={vi.fn()}
        run={run()}
        subsystemColor="#5b8def"
        subsystemName="Forge"
      />,
    );

    const row = screen.getByTestId(ArchiveRowTestId.Root);
    // jsdom normalizes an 8-digit hex (`#rrggbbaa`) to `rgba(...)` on readback —
    // assert via `toHaveStyle` (which parses both sides) rather than the raw string.
    expect(row).toHaveStyle({ borderColor: "#5b8def55" });
  });

  it("does not render a duration when the label is empty", () => {
    render(
      <ArchiveRow
        active={false}
        durationLabel=""
        onSelect={vi.fn()}
        run={run()}
        subsystemColor="#5b8def"
        subsystemName="Forge"
      />,
    );

    expect(screen.queryByText(/m$/)).not.toBeInTheDocument();
  });
});
