import { AnchoredSheetTestId } from "@zibby/design-system";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen } from "../../../../test/render";
import { NoteSheet } from "./NoteSheet";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("../../../knowledge/queries", () => ({
  useTeamKbNoteQuery: (teamId: string, path: string) => ({
    data:
      teamId === "devrel" && path === "meetings/a:b.md"
        ? { id: path, title: "Sync A", body: "We agreed **X**.", links: [] }
        : undefined,
  }),
}));
vi.mock("../../../teams/queries", () => ({
  useTeamsQuery: () => ({ data: [{ id: "devrel", name: "DevRel" }] }),
}));

const anchor = {
  left: 0,
  width: 400,
  top: 0,
  height: 400,
  eL: 0,
  eT: 0,
  eH: 0,
  side: "r",
} as never;

describe("NoteSheet", () => {
  it("renders the note body; the title opens the note in the vault", async () => {
    renderWithProviders(
      <NoteSheet anchor={anchor} id="devrel:meetings/a:b.md" onClose={vi.fn()} />,
    );
    expect(screen.getByTestId(AnchoredSheetTestId.Title)).toHaveTextContent("Sync A");
    expect(screen.getByTestId(AnchoredSheetTestId.Body)).toHaveTextContent("We agreed X.");
    screen.getByRole("button", { name: "Sync A" }).click();
    expect(push).toHaveBeenCalledWith(
      `/knowledge/vault?source=team%3Adevrel&note=${encodeURIComponent("meetings/a:b.md")}`,
    );
  });
});
