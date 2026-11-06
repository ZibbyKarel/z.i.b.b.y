import { describe, expect, it, vi } from "vitest";
import { fireEvent, renderWithProviders, screen, within } from "../../../test/render";
import { EntityRunList, EntityRunListTestId, issueRunTone, prRunTone } from "./EntityRunList";

const row = (id: string, startedAt: string) => ({
  id,
  label: `L-${id}`,
  stateLabel: "S",
  tone: "done" as const,
  startedAt,
});

describe("EntityRunList", () => {
  it("renders nothing when empty", () => {
    renderWithProviders(<EntityRunList onOpen={() => {}} rows={[]} />);
    expect(screen.queryByTestId(EntityRunListTestId.Root)).toBeNull();
  });

  it("sorts newest first, marks only the latest and opens a run on click", () => {
    const onOpen = vi.fn();
    renderWithProviders(
      <EntityRunList
        onOpen={onOpen}
        rows={[row("old", "2026-01-01T00:00:00Z"), row("new", "2026-01-02T00:00:00Z")]}
      />,
    );
    const rows = screen.getAllByTestId(EntityRunListTestId.Row);
    expect(rows[0]).toHaveTextContent("L-new");
    expect(within(rows[0]!).getByTestId(EntityRunListTestId.Latest)).toBeInTheDocument();
    expect(screen.getAllByTestId(EntityRunListTestId.Latest)).toHaveLength(1);
    fireEvent.click(rows[1]!);
    expect(onOpen).toHaveBeenCalledWith("old");
  });

  it("maps states to tones", () => {
    expect(prRunTone("awaiting-approval")).toBe("blocked");
    expect(prRunTone("pushed")).toBe("done");
    expect(prRunTone("discarded")).toBe("idle");
    expect(issueRunTone("running")).toBe("working");
    expect(issueRunTone("failed")).toBe("error");
  });
});
