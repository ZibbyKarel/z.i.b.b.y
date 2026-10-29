import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { renderWithProviders as render, screen } from "../../../test/render";
import { ResolveQuestionDialog, ResolveQuestionDialogTestId } from "./ResolveQuestionDialog";

const m = vi.hoisted(() => ({
  mutate: vi.fn(),
  isPending: false,
  error: null as unknown,
}));
const onClose = vi.fn();
const item = { text: "Who?", noteId: "m.md", noteTitle: "Sync" };

vi.mock("../mutations", () => ({
  useResolveTeamKbQuestionMutation: () => m,
}));

beforeEach(() => {
  m.mutate.mockReset();
  m.isPending = false;
  m.error = null;
  onClose.mockReset();
});

const setup = () => render(<ResolveQuestionDialog item={item} onClose={onClose} teamId="devrel" />);

describe("ResolveQuestionDialog", () => {
  it("shows the question and keeps submit disabled until an answer is typed", async () => {
    setup();
    expect(screen.getByText("Who?")).toBeInTheDocument();
    expect(screen.getByTestId(ResolveQuestionDialogTestId.Submit)).toBeDisabled();
    await userEvent.type(screen.getByTestId(ResolveQuestionDialogTestId.Answer), "Pavel");
    expect(screen.getByTestId(ResolveQuestionDialogTestId.Submit)).toBeEnabled();
  });

  it("submits noteId, question and answer, then closes", async () => {
    setup();
    await userEvent.type(screen.getByTestId(ResolveQuestionDialogTestId.Answer), "Pavel");
    await userEvent.click(screen.getByTestId(ResolveQuestionDialogTestId.Submit));
    expect(m.mutate).toHaveBeenCalledWith(
      { params: { id: "devrel" }, body: { noteId: "m.md", question: "Who?", answer: "Pavel" } },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
    m.mutate.mock.calls[0]![1].onSuccess();
    expect(onClose).toHaveBeenCalled();
  });

  it("disables submit while pending", async () => {
    m.isPending = true;
    setup();
    await userEvent.type(screen.getByTestId(ResolveQuestionDialogTestId.Answer), "Pavel");
    expect(screen.getByTestId(ResolveQuestionDialogTestId.Submit)).toBeDisabled();
  });

  it("shows the not-found message on 404", () => {
    m.error = { status: 404 };
    setup();
    expect(screen.getByTestId(ResolveQuestionDialogTestId.Error)).toHaveTextContent(
      "Otázka už v knowledge base není. Obnov widget.",
    );
  });
});
