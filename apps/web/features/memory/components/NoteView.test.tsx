import { renderWithProviders as render, screen } from "../../../test/render";
import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import type { Note } from "@zibby/contracts";
import { NoteView, NoteViewTestId } from "./NoteView";

const onSelect = vi.fn();
const updateNote = vi.fn();

vi.mock("../mutations", () => ({
  useUpdateNoteMutation: () => ({ mutate: updateNote, isPending: false }),
}));

const note: Note = {
  id: "zibby-index",
  path: "memory/zibby-index.md",
  tier: "memory",
  title: "ZIBBY Index",
  frontmatter: {},
  body: "The map of what ZIBBY knows.",
  links: ["north-star", "project-architecture"],
  backlinks: ["2026-06-14"],
};

describe("NoteView (33) — navigable wiki-links + backlinks", () => {
  beforeEach(() => {
    onSelect.mockClear();
    updateNote.mockClear();
  });

  it("renders the note body", () => {
    render(<NoteView note={note} onSelect={onSelect} />);
    expect(screen.getByText("The map of what ZIBBY knows.")).toBeInTheDocument();
  });

  it("navigates to an outbound link on click (index-first traversal)", async () => {
    render(<NoteView note={note} onSelect={onSelect} />);
    await userEvent.click(screen.getByTestId("memory-note-link-north-star"));
    expect(onSelect).toHaveBeenCalledWith("north-star");
  });

  it("navigates to a backlink on click", async () => {
    render(<NoteView note={note} onSelect={onSelect} />);
    await userEvent.click(screen.getByTestId("memory-note-backlink-2026-06-14"));
    expect(onSelect).toHaveBeenCalledWith("2026-06-14");
  });

  it("renders both link rows for a MOC-style note", () => {
    render(<NoteView note={note} onSelect={onSelect} />);
    expect(screen.getByTestId("memory-note-link-project-architecture")).toBeInTheDocument();
    expect(screen.getByTestId("memory-note-backlink-2026-06-14")).toBeInTheDocument();
  });

  it("shows the select-a-node fallback when no note is open", () => {
    render(<NoteView note={undefined} onSelect={onSelect} />);
    expect(screen.getByText("Vyber uzel a přečti si jeho poznámku.")).toBeInTheDocument();
    expect(screen.queryByTestId(NoteViewTestId.Edit)).not.toBeInTheDocument();
  });
});

describe("NoteView (N4g) — in-place edit mode", () => {
  beforeEach(() => {
    onSelect.mockClear();
    updateNote.mockClear();
  });

  it("Edit (top-right, accessible name) swaps the view for the editor", async () => {
    render(<NoteView note={note} onSelect={onSelect} />);
    await userEvent.click(screen.getByRole("button", { name: "Editovat" }));
    expect(screen.getByTestId(NoteViewTestId.Title)).toHaveValue("ZIBBY Index");
    // The wiki-link chips give way to the editor while editing.
    expect(screen.queryByTestId("memory-note-link-north-star")).toBeNull();
  });

  it("Save PATCHes {title, body} and returns to view mode", async () => {
    updateNote.mockImplementation((_vars, opts?: { onSuccess?: () => void }) =>
      opts?.onSuccess?.(),
    );
    render(<NoteView note={note} onSelect={onSelect} />);
    await userEvent.click(screen.getByTestId(NoteViewTestId.Edit));
    const title = screen.getByTestId(NoteViewTestId.Title);
    await userEvent.clear(title);
    await userEvent.type(title, "ZIBBY Index 2");
    await userEvent.click(screen.getByTestId(NoteViewTestId.Save));

    expect(updateNote).toHaveBeenCalledTimes(1);
    const call = updateNote.mock.calls[0]![0];
    expect(call.params).toEqual({ id: "zibby-index" });
    expect(call.body).toEqual({ title: "ZIBBY Index 2", body: "The map of what ZIBBY knows." });
    // Back in view mode: the edit affordance is offered again.
    expect(screen.getByTestId(NoteViewTestId.Edit)).toBeInTheDocument();
  });

  it("Cancel discards the draft without persisting", async () => {
    render(<NoteView note={note} onSelect={onSelect} />);
    await userEvent.click(screen.getByTestId(NoteViewTestId.Edit));
    await userEvent.type(screen.getByTestId(NoteViewTestId.Title), " — draft");
    await userEvent.click(screen.getByTestId(NoteViewTestId.Cancel));
    expect(updateNote).not.toHaveBeenCalled();
    expect(screen.getByText("The map of what ZIBBY knows.")).toBeInTheDocument();
  });
});
