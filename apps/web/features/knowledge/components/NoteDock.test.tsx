import userEvent from "@testing-library/user-event";
import { ChatDockTestId, DropdownTestId, MarkdownEditorTestId } from "@zibby/design-system";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderWithProviders as render, screen, within } from "../../../test/render";
import { NoteDock, NoteDockTestId, noteTitle } from "./NoteDock";

type MutateOpts = { onSuccess?: () => void };
const createNote = vi.fn((_vars: unknown, opts?: MutateOpts) => opts?.onSuccess?.());
const createKbNote = vi.fn((_vars: unknown, opts?: MutateOpts) => opts?.onSuccess?.());

interface TestTeam {
  id: string;
  name: string;
  knowledgeBase?: { kind: string; path: string; readOnly: boolean };
}
let teams: TestTeam[] = [];

vi.mock("../mutations", () => ({
  useCreateNoteMutation: () => ({ mutate: createNote, isPending: false }),
}));
vi.mock("../../teams", () => ({
  useTeamsQuery: () => ({ data: teams }),
  useCreateTeamKbNoteMutation: () => ({ mutate: createKbNote, isPending: false }),
}));

const voiceOpts: { onFinal: (text: string) => void }[] = [];
const voiceState = {
  supported: true,
  active: false,
  listening: false,
  interim: "",
  transcribing: false,
  toggle: vi.fn(),
  off: vi.fn(),
};
vi.mock("../../chat", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useVoiceMode: (o: { onFinal: (text: string) => void }) => {
    voiceOpts.push(o);
    return voiceState;
  },
}));

const control = () => screen.getByTestId(MarkdownEditorTestId.Control) as HTMLTextAreaElement;
const type = (text: string) => userEvent.type(control(), text);

describe("noteTitle", () => {
  it("takes the first non-blank line without heading marks", () => {
    expect(noteTitle("\n\n## Nápad: X\nbody")).toBe("Nápad: X");
    expect(noteTitle("   ")).toBe("");
    expect(noteTitle("a".repeat(100)).length).toBe(80);
  });
});

describe("NoteDock", () => {
  beforeEach(() => {
    createNote.mockClear();
    createKbNote.mockClear();
    voiceState.off.mockClear();
    voiceOpts.length = 0;
    teams = [];
  });

  it("saves to the vault by default with no tier", async () => {
    const onClose = vi.fn();
    render(<NoteDock open onClose={onClose} />);
    await type("# Nápad: X\n\nbody");
    await userEvent.click(screen.getByTestId(NoteDockTestId.Save));
    expect(createNote).toHaveBeenCalledTimes(1);
    const body = (createNote.mock.calls[0]?.[0] as { body: Record<string, unknown> }).body;
    expect(body.title).toBe("Nápad: X");
    expect(body.id).toMatch(/^napad-x-[a-z0-9]+$/);
    expect(body).not.toHaveProperty("tier");
    expect(onClose).toHaveBeenCalled();
  });

  it("offers only Vault when no team has a KB", async () => {
    teams = [{ id: "a", name: "A" }];
    render(<NoteDock open onClose={vi.fn()} />);
    await userEvent.click(
      within(screen.getByTestId(NoteDockTestId.Target)).getByTestId(DropdownTestId.Trigger),
    );
    expect(screen.getAllByTestId(DropdownTestId.Option).map((o) => o.textContent)).toEqual([
      "Vault",
    ]);
  });

  it("saves to a chosen team KB", async () => {
    teams = [
      { id: "dev", name: "Dev", knowledgeBase: { kind: "vault", path: "/kb", readOnly: true } },
    ];
    render(<NoteDock open onClose={vi.fn()} />);
    await userEvent.click(
      within(screen.getByTestId(NoteDockTestId.Target)).getByTestId(DropdownTestId.Trigger),
    );
    await userEvent.click(screen.getByText("Dev"));
    await type("hello");
    await userEvent.click(screen.getByTestId(NoteDockTestId.Save));
    expect(createKbNote).toHaveBeenCalledWith(
      { params: { id: "dev" }, body: { title: "hello", body: "hello" } },
      expect.anything(),
    );
    expect(createNote).not.toHaveBeenCalled();
  });

  it("disables Save while the draft is empty", () => {
    render(<NoteDock open onClose={vi.fn()} />);
    expect(screen.getByTestId(NoteDockTestId.Save)).toBeDisabled();
  });

  it("keeps the draft across close and reopen", async () => {
    const { rerender } = render(<NoteDock open onClose={vi.fn()} />);
    await type("draft");
    rerender(<NoteDock onClose={vi.fn()} open={false} />);
    rerender(<NoteDock open onClose={vi.fn()} />);
    expect(control().value).toBe("draft");
  });

  it("stays open with the draft when save fails", async () => {
    createNote.mockImplementationOnce(() => undefined);
    const onClose = vi.fn();
    render(<NoteDock open onClose={onClose} />);
    await type("keep me");
    await userEvent.click(screen.getByTestId(NoteDockTestId.Save));
    expect(onClose).not.toHaveBeenCalled();
    expect(control().value).toBe("keep me");
  });

  it("appends dictation", async () => {
    render(<NoteDock open onClose={vi.fn()} />);
    await type("abc");
    act(() => voiceOpts.at(-1)!.onFinal("def"));
    expect(control().value).toBe("abc def");
  });

  it("turns the mic off on close", () => {
    const { rerender } = render(<NoteDock open onClose={vi.fn()} />);
    rerender(<NoteDock onClose={vi.fn()} open={false} />);
    expect(voiceState.off).toHaveBeenCalled();
  });

  it("renders nothing when closed", () => {
    render(<NoteDock onClose={vi.fn()} open={false} />);
    expect(screen.queryByTestId(ChatDockTestId.Root)).toBeNull();
  });
});
