import { renderWithProviders as render, screen } from "../../../test/render";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QuickCapture, QuickCaptureTestId } from "./QuickCapture";

type MutateVars = { body: Record<string, unknown> };
type MutateOpts = { onSuccess?: () => void };

const createNote = vi.fn((_vars: MutateVars, opts?: MutateOpts) => opts?.onSuccess?.());

vi.mock("../mutations", () => ({
  useCreateNoteMutation: () => ({ mutate: createNote, isPending: false }),
}));

/**
 * The zero-friction "halda" capture path (Phase 109) — mirrors
 * `NoteEditorDialog.test.tsx`'s create-only assertions, but the body sent OMITS
 * `tier` entirely (the server default applies) and there is no tier control at all.
 */
describe("QuickCapture — omits tier, auto-slugs the id", () => {
  beforeEach(() => {
    createNote.mockClear();
  });

  it("slugs the id from the title and POSTs {id,title,body} with no tier", async () => {
    const onCaptured = vi.fn();
    const onClose = vi.fn();
    render(<QuickCapture onCaptured={onCaptured} onClose={onClose} />);

    await userEvent.type(screen.getByTestId(QuickCaptureTestId.Title), "My Quick Note");
    await userEvent.type(screen.getByTestId(QuickCaptureTestId.Body), "some halda text");
    await userEvent.click(screen.getByTestId(QuickCaptureTestId.Save));

    expect(createNote).toHaveBeenCalledTimes(1);
    const body = createNote.mock.calls[0]?.[0].body;
    expect(body).toEqual({ id: "my-quick-note", title: "My Quick Note", body: "some halda text" });
    expect(body).not.toHaveProperty("tier");
    expect(body).not.toHaveProperty("raw");
    expect(onCaptured).toHaveBeenCalledWith("my-quick-note");
    expect(onClose).toHaveBeenCalled();
  });

  it("falls back to a timestamp-based id when there is no title", async () => {
    const onCaptured = vi.fn();
    render(<QuickCapture onCaptured={onCaptured} onClose={vi.fn()} />);

    await userEvent.type(screen.getByTestId(QuickCaptureTestId.Body), "untitled halda dump");
    await userEvent.click(screen.getByTestId(QuickCaptureTestId.Save));

    expect(createNote).toHaveBeenCalledTimes(1);
    const body = createNote.mock.calls[0]?.[0].body as { id: string; title?: string };
    expect(body.id).toMatch(/^capture-[a-z0-9]+$/);
    expect(body.title).toBeUndefined();
    expect(onCaptured).toHaveBeenCalledWith(body.id);
  });

  it("disables Capture until there is body text", () => {
    render(<QuickCapture onCaptured={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByTestId(QuickCaptureTestId.Save)).toBeDisabled();
  });

  it("Cancel closes without saving", async () => {
    const onClose = vi.fn();
    render(<QuickCapture onCaptured={vi.fn()} onClose={onClose} />);
    await userEvent.type(screen.getByTestId(QuickCaptureTestId.Body), "won't be saved");
    await userEvent.click(screen.getByTestId(QuickCaptureTestId.Cancel));
    expect(createNote).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
