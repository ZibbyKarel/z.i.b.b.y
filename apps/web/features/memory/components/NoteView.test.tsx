import { renderWithProviders as render, screen } from "../../../test/render";
import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import type { Note } from "@zibby/contracts";
import { NoteView } from "./NoteView";

const onSelect = vi.fn();
const onEdit = vi.fn();

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
    onEdit.mockClear();
  });

  it("renders the note body", () => {
    render(<NoteView note={note} onEdit={onEdit} onSelect={onSelect} />);
    expect(screen.getByText("The map of what ZIBBY knows.")).toBeInTheDocument();
  });

  it("navigates to an outbound link on click (index-first traversal)", async () => {
    render(<NoteView note={note} onEdit={onEdit} onSelect={onSelect} />);
    await userEvent.click(screen.getByTestId("memory-note-link-north-star"));
    expect(onSelect).toHaveBeenCalledWith("north-star");
  });

  it("navigates to a backlink on click", async () => {
    render(<NoteView note={note} onEdit={onEdit} onSelect={onSelect} />);
    await userEvent.click(screen.getByTestId("memory-note-backlink-2026-06-14"));
    expect(onSelect).toHaveBeenCalledWith("2026-06-14");
  });

  it("renders both link rows for a MOC-style note", () => {
    render(<NoteView note={note} onEdit={onEdit} onSelect={onSelect} />);
    expect(screen.getByTestId("memory-note-link-project-architecture")).toBeInTheDocument();
    expect(screen.getByTestId("memory-note-backlink-2026-06-14")).toBeInTheDocument();
  });

  it("shows the select-a-node fallback when no note is open", () => {
    render(<NoteView note={undefined} onEdit={onEdit} onSelect={onSelect} />);
    expect(screen.getByText("Vyber uzel a přečti si jeho poznámku.")).toBeInTheDocument();
    expect(screen.queryByTestId("memory-note-edit")).not.toBeInTheDocument();
  });
});
