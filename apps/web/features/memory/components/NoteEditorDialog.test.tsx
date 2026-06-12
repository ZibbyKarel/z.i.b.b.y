import { renderWithProviders as render, screen } from "../../../test/render";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Note } from "@zibby/contracts";
import { NoteEditorDialog, NoteEditorDialogTestId } from "./NoteEditorDialog";

type MutateVars = { params?: { id: string }; body: Record<string, unknown> };
type MutateOpts = { onSuccess?: () => void };

const createNote = vi.fn((_vars: MutateVars, opts?: MutateOpts) => opts?.onSuccess?.());
const updateNote = vi.fn((_vars: MutateVars, opts?: MutateOpts) => opts?.onSuccess?.());

vi.mock("../mutations", () => ({
  useCreateNoteMutation: () => ({ mutate: createNote, isPending: false }),
  useUpdateNoteMutation: () => ({ mutate: updateNote, isPending: false }),
}));

describe("NoteEditorDialog", () => {
  beforeEach(() => {
    createNote.mockClear();
    updateNote.mockClear();
  });

  it("create: slugs the id from the title and POSTs {id,tier,title,body}", async () => {
    const onSaved = vi.fn();
    const onClose = vi.fn();
    render(<NoteEditorDialog mode="create" onClose={onClose} onSaved={onSaved} />);

    await userEvent.type(screen.getByTestId(NoteEditorDialogTestId.Title), "My New Note");
    // The id field auto-fills from the title.
    expect(screen.getByTestId(NoteEditorDialogTestId.Id)).toHaveValue("my-new-note");

    await userEvent.click(screen.getByTestId(NoteEditorDialogTestId.Save));

    expect(createNote).toHaveBeenCalledTimes(1);
    expect(createNote.mock.calls[0]?.[0].body).toEqual({
      id: "my-new-note",
      tier: "knowledge",
      title: "My New Note",
      body: "",
    });
    expect(onSaved).toHaveBeenCalledWith("my-new-note");
    expect(onClose).toHaveBeenCalled();
  });

  it("edit: prefills, and PATCHes title/body without id or tier", async () => {
    const note: Note = {
      id: "rohlik",
      path: "knowledge/rohlik.md",
      tier: "knowledge",
      title: "Rohlik",
      frontmatter: { title: "Rohlik" },
      links: [],
      backlinks: [],
      body: "Old body.",
    };
    const onSaved = vi.fn();
    render(<NoteEditorDialog mode="edit" note={note} onClose={() => {}} onSaved={onSaved} />);

    const title = screen.getByTestId(NoteEditorDialogTestId.Title);
    expect(title).toHaveValue("Rohlik");
    // No id field in edit mode (id is immutable).
    expect(screen.queryByTestId(NoteEditorDialogTestId.Id)).not.toBeInTheDocument();

    await userEvent.clear(title);
    await userEvent.type(title, "Rohlik 2");
    await userEvent.click(screen.getByTestId(NoteEditorDialogTestId.Save));

    expect(updateNote).toHaveBeenCalledTimes(1);
    const call = updateNote.mock.calls[0]?.[0];
    expect(call?.params).toEqual({ id: "rohlik" });
    expect(call?.body).toEqual({ title: "Rohlik 2", body: "Old body." });
    expect(call?.body).not.toHaveProperty("id");
    expect(call?.body).not.toHaveProperty("tier");
    expect(onSaved).toHaveBeenCalledWith("rohlik");
  });
});
