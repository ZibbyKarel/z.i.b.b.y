import { renderWithProviders as render, screen } from "../../../test/render";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NoteEditorDialog, NoteEditorDialogTestId } from "./NoteEditorDialog";

type MutateVars = { body: Record<string, unknown> };
type MutateOpts = { onSuccess?: () => void };

const createNote = vi.fn((_vars: MutateVars, opts?: MutateOpts) => opts?.onSuccess?.());

vi.mock("../mutations", () => ({
  useCreateNoteMutation: () => ({ mutate: createNote, isPending: false }),
}));

/**
 * The dialog is CREATE-ONLY (N4g — editing happens in place on the note panel):
 * it slugs the id from the title and POSTs the new note.
 */
describe("NoteEditorDialog — create-only", () => {
  beforeEach(() => {
    createNote.mockClear();
  });

  it("slugs the id from the title and POSTs {id,tier,title,body}", async () => {
    const onSaved = vi.fn();
    const onClose = vi.fn();
    render(<NoteEditorDialog onClose={onClose} onSaved={onSaved} />);

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

  it("a hand-edited id stops following the title", async () => {
    render(<NoteEditorDialog onClose={vi.fn()} onSaved={vi.fn()} />);
    const id = screen.getByTestId(NoteEditorDialogTestId.Id);
    await userEvent.type(id, "custom-id");
    await userEvent.type(screen.getByTestId(NoteEditorDialogTestId.Title), "Whatever Title");
    expect(id).toHaveValue("custom-id");
  });
});
