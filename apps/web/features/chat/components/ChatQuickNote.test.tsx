import { renderWithProviders as render, screen } from "../../../test/render";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChatQuickNote, ChatQuickNoteTestId } from "./ChatQuickNote";

type MutateVars = { body: Record<string, unknown> };
type MutateOpts = { onSuccess?: () => void };

const createNote = vi.fn((_vars: MutateVars, opts?: MutateOpts) => opts?.onSuccess?.());

vi.mock("../../memory/mutations", () => ({
  useCreateNoteMutation: () => ({ mutate: createNote, isPending: false }),
}));

describe("ChatQuickNote — bottom-bar add-note composer", () => {
  beforeEach(() => {
    createNote.mockClear();
  });

  it("renders the body textarea and save button", () => {
    render(<ChatQuickNote onClose={vi.fn()} />);
    expect(screen.getByTestId(ChatQuickNoteTestId.Body)).toBeInTheDocument();
    expect(screen.getByTestId(ChatQuickNoteTestId.Save)).toBeInTheDocument();
  });

  it("disables Save until there is body text", () => {
    render(<ChatQuickNote onClose={vi.fn()} />);
    expect(screen.getByTestId(ChatQuickNoteTestId.Save)).toBeDisabled();
  });

  it("enables Save once text is typed", async () => {
    render(<ChatQuickNote onClose={vi.fn()} />);
    await userEvent.type(screen.getByTestId(ChatQuickNoteTestId.Body), "a quick note");
    expect(screen.getByTestId(ChatQuickNoteTestId.Save)).toBeEnabled();
  });

  it("saving POSTs a timestamp-based id with no title, then closes", async () => {
    const onClose = vi.fn();
    const onSaved = vi.fn();
    render(<ChatQuickNote onClose={onClose} onSaved={onSaved} />);

    await userEvent.type(screen.getByTestId(ChatQuickNoteTestId.Body), "dump for ZIBBY");
    await userEvent.click(screen.getByTestId(ChatQuickNoteTestId.Save));

    expect(createNote).toHaveBeenCalledTimes(1);
    const body = createNote.mock.calls[0]?.[0].body as { id: string; body: string };
    expect(body.id).toMatch(/^capture-[a-z0-9]+$/);
    expect(body.body).toBe("dump for ZIBBY");
    expect(body).not.toHaveProperty("title");
    expect(body).not.toHaveProperty("tier");
    expect(onSaved).toHaveBeenCalledWith(body.id);
    expect(onClose).toHaveBeenCalled();
  });

  it("Close fires onClose without saving", async () => {
    const onClose = vi.fn();
    render(<ChatQuickNote onClose={onClose} />);
    await userEvent.type(screen.getByTestId(ChatQuickNoteTestId.Body), "won't be saved");
    await userEvent.click(screen.getByTestId(ChatQuickNoteTestId.Close));
    expect(createNote).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
