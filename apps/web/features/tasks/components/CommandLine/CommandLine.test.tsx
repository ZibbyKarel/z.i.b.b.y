import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  FilePreviewTestId,
  HighlightTextAreaFieldTestId,
  PanelTestId,
  SearchMenuTestId,
} from "@zibby/design-system";
import {
  fireEvent,
  renderWithProviders as render,
  screen,
  waitFor,
  within,
} from "../../../../test/render";
import { CommandLine, CommandLineTestId } from "./CommandLine";

/**
 * Phase 118d: `CommandLine` is the GENERIC draft composer — text, `@`-mention target,
 * attachments, highlights, suggestions — firing `onSubmit` on Enter/Send. It no longer
 * knows about task-launch (scheduling, the loop path, the project scope, the
 * classification ack row); those moved to `TaskCommandLine` (`TaskCommandLine.test.tsx`
 * owns their coverage now). `onSubmit` is REQUIRED — every render below supplies one.
 */
vi.mock("../../../agents/queries/useAgentsQuery", () => ({
  useAgentsQuery: () => ({
    data: [
      { id: "builder", name: "Builder", glyph: "hammer" },
      { id: "koder", name: "Kodér" },
    ],
  }),
  getAgentsQueryKey: () => ["agents"],
}));
vi.mock("../../../pipelines/queries/usePipelinesQuery", () => ({
  usePipelinesQuery: () => ({
    data: [{ id: "delivery", name: "Delivery", ownerSubsystem: "forge" }],
  }),
  getPipelinesQueryKey: () => ["pipelines"],
}));
// Phase 91: two subsystems in the registry — only "forge" owns a pipeline (see the
// pipelines mock above), "puls" owns none — so the mention catalog roster-filter
// (≥1 owned pipeline) has something real to exclude.
vi.mock("../../../subsystems/queries/useSubsystemsQuery", () => ({
  useSubsystemsQuery: () => ({
    data: [
      { id: "forge", name: "Forge", color: "#f97316", state: "idle", tier2Count: 0, tier3Count: 0 },
      { id: "puls", name: "Puls", color: "#14b8a6", state: "idle", tier2Count: 0, tier3Count: 0 },
    ],
  }),
}));
// Task 8: the fourth mention source — teams a picked row tags, never dispatches to.
vi.mock("../../../teams", () => ({
  useTeamsQuery: () => ({ data: [{ id: "devrel", name: "DevRel" }] }),
}));

const uploadMutateAsync = vi.fn().mockResolvedValue({
  attachmentSetId: "set_1",
  files: [{ name: "a.txt", size: 2 }],
});
vi.mock("../../mutations/useUploadTaskAttachmentsMutation", () => ({
  useUploadTaskAttachmentsMutation: () => ({ mutateAsync: uploadMutateAsync, isPending: false }),
}));

// The top target chip is gone (Phase 59) — this literal (not a live enum member any
// more, retired in Phase 118d since no consumer renders it) is kept ONLY so the
// "never resolves" regression assertions below keep their original intent.
const RETIRED_TARGET_CHIP_TESTID = "command-line-target-chip";

describe("CommandLine (Phase 118d generic composer)", () => {
  beforeEach(() => {
    uploadMutateAsync.mockClear();
  });

  it("does not submit on an empty description", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<CommandLine onSubmit={onSubmit} />);
    await user.click(screen.getByTestId(CommandLineTestId.Input));
    await user.keyboard("{Enter}");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("inserts a newline on Shift+Enter instead of submitting", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<CommandLine onSubmit={onSubmit} />);

    const input = screen.getByTestId(CommandLineTestId.Input);
    await user.type(input, "line one");
    await user.keyboard("{Shift>}{Enter}{/Shift}");
    await user.type(input, "line two");

    expect(onSubmit).not.toHaveBeenCalled();
    expect(input).toHaveValue("line one\nline two");
  });

  describe("@ mention picker — Phase 45: a caret-anchored INLINE dropdown, never a separate search box", () => {
    it("opens inline on '@', filters live as the query is typed in the SAME field, and assigns the picked target as the highlighted inline @Name (no top chip)", async () => {
      const onTargetChange = vi.fn();
      const user = userEvent.setup();
      render(<CommandLine onSubmit={vi.fn()} onTargetChange={onTargetChange} />);

      const input = screen.getByTestId(CommandLineTestId.Input);
      await user.type(input, "@Bui");

      // The dropdown is anchored under the SAME field — never an external
      // SearchMenu with its own input stealing focus.
      expect(screen.getByTestId(CommandLineTestId.MentionMenu)).toBeInTheDocument();
      expect(screen.queryByTestId(SearchMenuTestId.Root)).not.toBeInTheDocument();
      expect(input).toHaveFocus();

      expect(
        screen.getByTestId(`${CommandLineTestId.MentionItem}-agent-builder`),
      ).toBeInTheDocument();
      expect(
        screen.queryByTestId(`${CommandLineTestId.MentionItem}-pipeline-delivery`),
      ).not.toBeInTheDocument();

      await user.click(screen.getByTestId(`${CommandLineTestId.MentionItem}-agent-builder`));

      // Phase 59: no top target chip any more — the picked `@Name` inline,
      // highlighted, is the only visible trace of the assigned target.
      expect(screen.queryByTestId(RETIRED_TARGET_CHIP_TESTID)).not.toBeInTheDocument();
      expect(input).toHaveValue("@Builder ");
      const marks = screen.getAllByTestId(HighlightTextAreaFieldTestId.Mark);
      expect(marks.find((m) => m.textContent === "@Builder")).toHaveClass("bg-accent/[0.14]");
      expect(screen.queryByTestId(CommandLineTestId.MentionMenu)).not.toBeInTheDocument();
      expect(onTargetChange).toHaveBeenLastCalledWith({
        kind: "agent",
        id: "builder",
        name: "Builder",
        glyph: "hammer",
      });
    });

    it("navigates with ArrowDown and picks with Enter — the textarea itself carries the keyboard nav", async () => {
      const user = userEvent.setup();
      render(<CommandLine onSubmit={vi.fn()} />);
      const input = screen.getByTestId(CommandLineTestId.Input);
      await user.type(input, "@");
      expect(input).toHaveFocus();

      // Results order: Builder, Kodér, Delivery — ArrowDown once lands on Kodér.
      await user.keyboard("{ArrowDown}{Enter}");

      expect(input).toHaveFocus();
      expect(input).toHaveValue("@Kodér ");
      expect(screen.queryByTestId(CommandLineTestId.MentionMenu)).not.toBeInTheDocument();
    });

    it("closes on Escape without submitting or touching the typed text, and leaves the ordinary submit-on-Enter path intact", async () => {
      const onSubmit = vi.fn();
      const user = userEvent.setup();
      render(<CommandLine onSubmit={onSubmit} />);
      const input = screen.getByTestId(CommandLineTestId.Input);
      await user.type(input, "@Bui");
      expect(screen.getByTestId(CommandLineTestId.MentionMenu)).toBeInTheDocument();

      await user.keyboard("{Escape}");

      expect(screen.queryByTestId(CommandLineTestId.MentionMenu)).not.toBeInTheDocument();
      expect(input).toHaveValue("@Bui");
      expect(onSubmit).not.toHaveBeenCalled();

      // No mention open any more — Enter now takes the ordinary submit path.
      await user.keyboard("{Enter}");
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    it("submits carrying the mentioned target — reaching the whole catalog, not just classify candidates", async () => {
      const onSubmit = vi.fn();
      const user = userEvent.setup();
      render(<CommandLine onSubmit={onSubmit} />);
      const input = screen.getByTestId(CommandLineTestId.Input);
      await user.type(input, "@Deliv");
      await user.click(screen.getByTestId(`${CommandLineTestId.MentionItem}-pipeline-delivery`));
      await user.type(input, "spusť to");

      await user.click(screen.getByTestId(CommandLineTestId.Send));
      expect(onSubmit).toHaveBeenCalledWith(
        "@Delivery spusť to",
        { kind: "pipeline", id: "delivery", name: "Delivery", glyph: "flow" },
        undefined,
      );
    });

    it("keeps the target while the @Name mention stays in the text, unaffected by trailing edits", async () => {
      const onTargetChange = vi.fn();
      const user = userEvent.setup();
      render(<CommandLine onSubmit={vi.fn()} onTargetChange={onTargetChange} />);
      const input = screen.getByTestId(CommandLineTestId.Input);
      await user.type(input, "@Bui");
      await user.click(screen.getByTestId(`${CommandLineTestId.MentionItem}-agent-builder`));
      onTargetChange.mockClear();

      await user.type(input, "prosím zkontroluj to");

      expect(onTargetChange).not.toHaveBeenCalled();
    });

    it("deleting the @Name out of the text clears the target — there is no chip left to click", async () => {
      const onTargetChange = vi.fn();
      const user = userEvent.setup();
      render(<CommandLine onSubmit={vi.fn()} onTargetChange={onTargetChange} />);
      const input = screen.getByTestId(CommandLineTestId.Input);
      await user.type(input, "@Bui");
      await user.click(screen.getByTestId(`${CommandLineTestId.MentionItem}-agent-builder`));
      expect(onTargetChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ id: "builder", name: "Builder" }),
      );
      expect(screen.queryByTestId(RETIRED_TARGET_CHIP_TESTID)).not.toBeInTheDocument();

      await user.clear(input);

      expect(input).toHaveValue("");
      expect(onTargetChange).toHaveBeenLastCalledWith(undefined);
    });
  });

  describe("Phase 91 — subsystem @-mentions (roster-only, explicit target)", () => {
    it("lists a roster-bearing subsystem (≥1 owned pipeline) as a colored-dot row, never a capability-less one", async () => {
      const user = userEvent.setup();
      render(<CommandLine onSubmit={vi.fn()} />);
      const input = screen.getByTestId(CommandLineTestId.Input);
      await user.type(input, "@");

      // "forge" owns the "delivery" pipeline (mocked above) — it's dispatchable,
      // so it belongs in the picker.
      expect(
        screen.getByTestId(`${CommandLineTestId.MentionItem}-subsystem-forge`),
      ).toBeInTheDocument();
      // "puls" owns nothing — mentioning it would only ever hit the 0-owned
      // validation reject, so it must never appear, at ANY query (including empty).
      expect(
        screen.queryByTestId(`${CommandLineTestId.MentionItem}-subsystem-puls`),
      ).not.toBeInTheDocument();

      // The icon is a colored dot (the subsystem's own brand color), not the usual
      // agent/pipeline Tag+glyph chip.
      const dot = screen.getByTestId(`${CommandLineTestId.MentionItem}-subsystem-forge-dot`);
      expect(dot).toHaveStyle({ background: "#f97316" });
    });

    it("filters the subsystem row by query exactly like agents/pipelines", async () => {
      const user = userEvent.setup();
      render(<CommandLine onSubmit={vi.fn()} />);
      const input = screen.getByTestId(CommandLineTestId.Input);
      await user.type(input, "@puls");

      // "puls" never matches the query either, because it's excluded from the
      // candidate list before filtering even runs.
      expect(screen.getByTestId(CommandLineTestId.MentionEmpty)).toBeInTheDocument();
    });

    it("selecting a subsystem sets the explicit subsystem target — the submit payload carries kind: subsystem", async () => {
      const onSubmit = vi.fn();
      const user = userEvent.setup();
      render(<CommandLine onSubmit={onSubmit} />);
      const input = screen.getByTestId(CommandLineTestId.Input);
      await user.type(input, "@Forge");
      await user.click(screen.getByTestId(`${CommandLineTestId.MentionItem}-subsystem-forge`));

      expect(input).toHaveValue("@Forge ");
      await user.type(input, "dispatch this to the subsystem");
      await user.click(screen.getByTestId(CommandLineTestId.Send));

      expect(onSubmit).toHaveBeenCalledWith(
        "@Forge dispatch this to the subsystem",
        { kind: "subsystem", id: "forge", name: "Forge", glyph: "grid" },
        undefined,
      );
    });
  });

  describe("Task 8 — team @-mentions tag scope, never a routing target", () => {
    it("lists a team row as the fourth mention source", async () => {
      const user = userEvent.setup();
      render(<CommandLine onSubmit={vi.fn()} />);
      await user.type(screen.getByTestId(CommandLineTestId.Input), "@");

      expect(
        screen.getByTestId(`${CommandLineTestId.MentionItem}-team-devrel`),
      ).toBeInTheDocument();
    });

    it("picking a team inserts the inline @Name and calls onTeamChange with its id — onTargetChange never fires", async () => {
      const onTargetChange = vi.fn();
      const onTeamChange = vi.fn();
      const user = userEvent.setup();
      render(
        <CommandLine
          onSubmit={vi.fn()}
          onTargetChange={onTargetChange}
          onTeamChange={onTeamChange}
        />,
      );
      const input = screen.getByTestId(CommandLineTestId.Input);
      await user.type(input, "@DevRel");
      await user.click(screen.getByTestId(`${CommandLineTestId.MentionItem}-team-devrel`));

      expect(input).toHaveValue("@DevRel ");
      expect(onTeamChange).toHaveBeenCalledWith("devrel");
      expect(onTargetChange).not.toHaveBeenCalled();
    });

    it("submits with no target when only a team was picked — a team tag never becomes a dispatch destination", async () => {
      const onSubmit = vi.fn();
      const user = userEvent.setup();
      render(<CommandLine onSubmit={onSubmit} />);
      const input = screen.getByTestId(CommandLineTestId.Input);
      await user.type(input, "@DevRel");
      await user.click(screen.getByTestId(`${CommandLineTestId.MentionItem}-team-devrel`));
      await user.type(input, "co víme o partner portálu?");
      await user.click(screen.getByTestId(CommandLineTestId.Send));

      expect(onSubmit).toHaveBeenCalledWith(
        "@DevRel co víme o partner portálu?",
        undefined,
        undefined,
      );
    });

    it("a team tag and an agent target co-exist independently in the same draft", async () => {
      const onSubmit = vi.fn();
      const onTeamChange = vi.fn();
      const user = userEvent.setup();
      render(<CommandLine onSubmit={onSubmit} onTeamChange={onTeamChange} />);
      const input = screen.getByTestId(CommandLineTestId.Input);
      await user.type(input, "@DevRel");
      await user.click(screen.getByTestId(`${CommandLineTestId.MentionItem}-team-devrel`));
      await user.type(input, "@Bui");
      await user.click(screen.getByTestId(`${CommandLineTestId.MentionItem}-agent-builder`));
      await user.type(input, "shrň to");
      await user.click(screen.getByTestId(CommandLineTestId.Send));

      expect(onSubmit).toHaveBeenCalledWith(
        "@DevRel @Builder shrň to",
        { kind: "agent", id: "builder", name: "Builder", glyph: "hammer" },
        undefined,
      );
      expect(onTeamChange).toHaveBeenCalledWith("devrel");
    });

    it("deleting the @Name out of the text clears the team tag, independent of any picked target", async () => {
      const onTeamChange = vi.fn();
      const user = userEvent.setup();
      render(<CommandLine onSubmit={vi.fn()} onTeamChange={onTeamChange} />);
      const input = screen.getByTestId(CommandLineTestId.Input);
      await user.type(input, "@DevRel");
      await user.click(screen.getByTestId(`${CommandLineTestId.MentionItem}-team-devrel`));
      onTeamChange.mockClear();

      await user.clear(input);

      expect(onTeamChange).toHaveBeenCalledWith(undefined);
    });
  });

  describe("attachments", () => {
    it("uploads a file picked via the + button and shows it as a compact tile inside the box", async () => {
      const onAttachmentsChange = vi.fn();
      const user = userEvent.setup();
      render(<CommandLine onAttachmentsChange={onAttachmentsChange} onSubmit={vi.fn()} />);

      const file = new File(["hi"], "a.txt", { type: "text/plain" });
      await user.upload(screen.getByTestId(CommandLineTestId.FileInput), file);

      await waitFor(() => {
        expect(screen.getByTestId(FilePreviewTestId.Name)).toHaveTextContent("a.txt");
      });
      // Phase 59: the tile lives INSIDE the box (never the old full-width stack
      // below it), as a compact, name+size tile.
      const tile = screen.getByTestId(`${CommandLineTestId.FileTile}-a.txt`);
      expect(screen.getByTestId(CommandLineTestId.Box).contains(tile)).toBe(true);
      expect(within(tile).getByTestId(FilePreviewTestId.Size)).toHaveTextContent("2 B");
      expect(onAttachmentsChange).toHaveBeenCalledWith({
        attachmentSetId: "set_1",
        files: [{ name: "a.txt", size: 2 }],
      });
    });

    it("carries the attached set into the onSubmit payload", async () => {
      const onSubmit = vi.fn();
      const user = userEvent.setup();
      render(<CommandLine onSubmit={onSubmit} />);
      const file = new File(["hi"], "a.txt", { type: "text/plain" });
      await user.upload(screen.getByTestId(CommandLineTestId.FileInput), file);
      await waitFor(() => expect(screen.getByTestId(FilePreviewTestId.Name)).toBeInTheDocument());

      await user.type(screen.getByTestId(CommandLineTestId.Input), "zkontroluj zálohy");
      await user.click(screen.getByTestId(CommandLineTestId.Send));

      expect(onSubmit).toHaveBeenCalledWith("zkontroluj zálohy", undefined, {
        attachmentSetId: "set_1",
        files: [{ name: "a.txt", size: 2 }],
      });
    });

    it("removes a single file via its own tile's remove button, leaving the rest attached", async () => {
      uploadMutateAsync.mockResolvedValueOnce({
        attachmentSetId: "set_2",
        files: [
          { name: "a.txt", size: 2 },
          { name: "b.txt", size: 2048 },
        ],
      });
      const onAttachmentsChange = vi.fn();
      const user = userEvent.setup();
      render(<CommandLine onAttachmentsChange={onAttachmentsChange} onSubmit={vi.fn()} />);

      const files = [
        new File(["hi"], "a.txt", { type: "text/plain" }),
        new File(["ho"], "b.txt", { type: "text/plain" }),
      ];
      await user.upload(screen.getByTestId(CommandLineTestId.FileInput), files);

      const tileA = await screen.findByTestId(`${CommandLineTestId.FileTile}-a.txt`);
      const tileB = screen.getByTestId(`${CommandLineTestId.FileTile}-b.txt`);
      expect(within(tileB).getByTestId(FilePreviewTestId.Size)).toHaveTextContent("2 KB");

      await user.click(within(tileB).getByTestId(FilePreviewTestId.Remove));

      expect(onAttachmentsChange).toHaveBeenLastCalledWith({
        attachmentSetId: "set_2",
        files: [{ name: "a.txt", size: 2 }],
      });
      expect(screen.queryByTestId(`${CommandLineTestId.FileTile}-b.txt`)).not.toBeInTheDocument();
      expect(tileA).toBeInTheDocument();
    });

    it("surfaces an upload error message without blocking the rest of the composer", async () => {
      uploadMutateAsync.mockRejectedValueOnce(new Error("nope"));
      const user = userEvent.setup();
      render(<CommandLine onSubmit={vi.fn()} />);

      const file = new File(["hi"], "bad.txt", { type: "text/plain" });
      await user.upload(screen.getByTestId(CommandLineTestId.FileInput), file);

      expect(await screen.findByText("Nahrání selhalo")).toBeInTheDocument();
      expect(screen.queryByTestId(`${CommandLineTestId.FileTile}-bad.txt`)).not.toBeInTheDocument();
    });
  });

  describe("Phase 31a — velin-b chrome, drag overlay, mention tones, suggestions", () => {
    it("wraps the input in the panel chrome by default (header icon + label + hint)", () => {
      render(<CommandLine onSubmit={vi.fn()} />);
      expect(screen.getByTestId(PanelTestId.Header)).toHaveTextContent("Zadej směr");
      expect(screen.getByText(/hledá agenty, pipeliny a podsystémy/)).toBeInTheDocument();
    });

    it("renders a bare input with no panel chrome when chrome={false}", () => {
      render(<CommandLine chrome={false} onSubmit={vi.fn()} />);
      expect(screen.queryByTestId(PanelTestId.Header)).not.toBeInTheDocument();
      expect(screen.getByTestId(CommandLineTestId.Input)).toBeInTheDocument();
    });

    it("shows the dashed drop overlay while dragging over the box, and hides it on drag-leave", () => {
      render(<CommandLine onSubmit={vi.fn()} />);
      const box = screen.getByTestId(CommandLineTestId.Box);
      expect(screen.queryByTestId(CommandLineTestId.DropOverlay)).not.toBeInTheDocument();

      fireEvent.dragOver(box);
      expect(screen.getByTestId(CommandLineTestId.DropOverlay)).toBeInTheDocument();

      fireEvent.dragLeave(box);
      expect(screen.queryByTestId(CommandLineTestId.DropOverlay)).not.toBeInTheDocument();
    });

    it("hides the drop overlay again once a drop lands", () => {
      render(<CommandLine onSubmit={vi.fn()} />);
      const box = screen.getByTestId(CommandLineTestId.Box);
      fireEvent.dragOver(box);
      expect(screen.getByTestId(CommandLineTestId.DropOverlay)).toBeInTheDocument();

      fireEvent.drop(box, { dataTransfer: { files: [] } });
      expect(screen.queryByTestId(CommandLineTestId.DropOverlay)).not.toBeInTheDocument();
    });

    it("highlights a referenced path inline in the description", async () => {
      const user = userEvent.setup();
      render(<CommandLine onSubmit={vi.fn()} />);
      await user.type(
        screen.getByTestId(CommandLineTestId.Input),
        "uprav /tmp/scratch/widget a otestuj",
      );
      const marks = await screen.findAllByTestId(HighlightTextAreaFieldTestId.Mark);
      expect(marks.map((m) => m.textContent).join("")).toContain("/tmp/scratch/widget");
    });

    it("tints @mentions by resolved type — a known agent accent, a known pipeline push, an unresolved token dim", () => {
      render(<CommandLine onSubmit={vi.fn()} />);
      // A single `change` (rather than typing character-by-character) — typing a
      // literal `@` triggers the mention picker, which steals focus to its own
      // search input; this test only cares what the final text renders as, not the
      // picker's own UX (already covered by the "@ mention picker" describe above).
      fireEvent.change(screen.getByTestId(CommandLineTestId.Input), {
        target: { value: "@Builder a @Delivery a @report.md" },
      });

      const marks = screen.getAllByTestId(HighlightTextAreaFieldTestId.Mark);
      const byText = (needle: string) => marks.find((m) => m.textContent === needle);

      expect(byText("@Builder")).toHaveClass("bg-accent/[0.14]");
      expect(byText("@Delivery")).toHaveClass("bg-risk-push/[0.14]");
      expect(byText("@report.md")).toHaveClass("bg-foreground-dim/[0.14]");
    });

    it("shows suggestion chips only while the input is empty, and clicking one submits it immediately", async () => {
      const onSubmit = vi.fn();
      const user = userEvent.setup();
      // `resetOnSubmit={false}` mirrors how `TaskCommandLine` actually composes
      // `suggestions` (its own ack row needs the submitted text to survive) — the
      // default `resetOnSubmit={true}` would clear the field right back to empty,
      // which would trivially bring the chip rail straight back.
      render(
        <CommandLine
          onSubmit={onSubmit}
          resetOnSubmit={false}
          suggestions={["zkontroluj zálohy", "shrň standup"]}
        />,
      );

      const chips = screen.getAllByTestId(CommandLineTestId.Suggestion);
      expect(chips.length).toBeGreaterThan(0);
      expect(chips.map((c) => c.textContent)).toEqual(["zkontroluj zálohy", "shrň standup"]);

      await user.click(chips[0] as HTMLElement);

      expect(onSubmit).toHaveBeenCalledTimes(1);
      expect(onSubmit).toHaveBeenCalledWith("zkontroluj zálohy", undefined, undefined);
      // The submitted text stays in the field — no longer empty — so the chip
      // rail is gone.
      expect(screen.queryByTestId(CommandLineTestId.Suggestion)).not.toBeInTheDocument();
    });
  });

  describe("submit dispatch — onSubmit, the Send action, and draft/injected-target lifecycle", () => {
    it("calls onSubmit on Enter, carrying the picked target, and clears the field", async () => {
      const onSubmit = vi.fn();
      const user = userEvent.setup();
      render(<CommandLine onSubmit={onSubmit} />);

      const input = screen.getByTestId(CommandLineTestId.Input);
      await user.type(input, "@Bui");
      await user.click(screen.getByTestId(`${CommandLineTestId.MentionItem}-agent-builder`));
      await user.type(input, "ahoj");
      await user.keyboard("{Enter}");

      expect(onSubmit).toHaveBeenCalledWith(
        "@Builder ahoj",
        { kind: "agent", id: "builder", name: "Builder", glyph: "hammer" },
        undefined,
      );
      expect(input).toHaveValue("");
    });

    it("renders the Send action, and Send dispatches via onSubmit", async () => {
      const onSubmit = vi.fn();
      const user = userEvent.setup();
      render(<CommandLine onSubmit={onSubmit} />);

      expect(screen.getByTestId(CommandLineTestId.Send)).toBeInTheDocument();

      await user.type(screen.getByTestId(CommandLineTestId.Input), "ahoj");
      await user.click(screen.getByTestId(CommandLineTestId.Send));

      expect(onSubmit).toHaveBeenCalledWith("ahoj", undefined, undefined);
    });

    it("disables the input and the Send action while `disabled` is set (e.g. while ZIBBY is thinking)", () => {
      render(<CommandLine disabled initialText="ahoj" onSubmit={vi.fn()} />);
      expect(screen.getByTestId(CommandLineTestId.Input)).toBeDisabled();
      expect(screen.getByTestId(CommandLineTestId.Send)).toBeDisabled();
    });

    it("renders `submitLabel` instead of the default Send label when provided, without changing the submit action", async () => {
      const onSubmit = vi.fn();
      const user = userEvent.setup();
      render(<CommandLine onSubmit={onSubmit} submitLabel="Naplánovat" />);

      const sendButton = screen.getByTestId(CommandLineTestId.Send);
      expect(sendButton).toHaveTextContent("Naplánovat");
      expect(sendButton).not.toHaveTextContent("Odeslat");

      await user.type(screen.getByTestId(CommandLineTestId.Input), "ahoj");
      await user.click(sendButton);

      expect(onSubmit).toHaveBeenCalledWith("ahoj", undefined, undefined);
    });

    it("falls back to the default `commandLine.send` label when `submitLabel` is omitted", () => {
      render(<CommandLine onSubmit={vi.fn()} />);
      expect(screen.getByTestId(CommandLineTestId.Send)).toHaveTextContent("Odeslat");
    });

    it("applies an externally injected target (the chat quick-switcher palette) into the text, then reports it consumed", () => {
      const onInjectedTargetConsumed = vi.fn();
      const target = { kind: "agent", id: "builder", name: "Builder", glyph: "bot" } as const;
      const { rerender } = render(
        <CommandLine onInjectedTargetConsumed={onInjectedTargetConsumed} onSubmit={vi.fn()} />,
      );
      rerender(
        <CommandLine
          injectedTarget={target}
          onInjectedTargetConsumed={onInjectedTargetConsumed}
          onSubmit={vi.fn()}
        />,
      );

      expect(screen.getByTestId(CommandLineTestId.Input)).toHaveValue("@Builder ");
      expect(onInjectedTargetConsumed).toHaveBeenCalledTimes(1);
    });

    it("fires onDraftChange true/false as the draft flips between empty and non-empty", async () => {
      const onDraftChange = vi.fn();
      const user = userEvent.setup();
      render(<CommandLine onDraftChange={onDraftChange} onSubmit={vi.fn()} />);

      const input = screen.getByTestId(CommandLineTestId.Input);
      await user.type(input, "h");
      expect(onDraftChange).toHaveBeenLastCalledWith(true);

      await user.keyboard("{Enter}");
      expect(onDraftChange).toHaveBeenLastCalledWith(false);
    });

    describe("showAttach={false} (chat: the message API has no attachment channel)", () => {
      it("hides the attach/pin buttons and the hidden file input", () => {
        render(<CommandLine onSubmit={vi.fn()} showAttach={false} />);
        expect(screen.queryByTestId(CommandLineTestId.Attach)).not.toBeInTheDocument();
        expect(screen.queryByTestId(CommandLineTestId.Pin)).not.toBeInTheDocument();
        expect(screen.queryByTestId(CommandLineTestId.FileInput)).not.toBeInTheDocument();
      });

      it("ignores drag-and-drop — no overlay ever shows", () => {
        render(<CommandLine onSubmit={vi.fn()} showAttach={false} />);
        fireEvent.dragOver(screen.getByTestId(CommandLineTestId.Box));
        expect(screen.queryByTestId(CommandLineTestId.DropOverlay)).not.toBeInTheDocument();
      });
    });
  });

  describe("Phase 51 — caret-anchored portaled panel & controls inside the input", () => {
    it("portals the mention panel to document.body so no wrapper overflow/z clips it", async () => {
      const user = userEvent.setup();
      render(<CommandLine onSubmit={vi.fn()} />);
      await user.type(screen.getByTestId(CommandLineTestId.Input), "@Bui");

      // createPortal renders the panel's surface as a direct child of <body>, escaping
      // the CommandLine wrapper (the HUD card / chat composer) entirely.
      const menu = screen.getByTestId(CommandLineTestId.MentionMenu);
      expect(menu.parentElement).toBe(document.body);
      expect(screen.getByTestId(CommandLineTestId.Box).contains(menu)).toBe(false);
    });

    it("still picks a portaled result on click, assigning the target via the inline @Name", async () => {
      const user = userEvent.setup();
      render(<CommandLine onSubmit={vi.fn()} />);
      const input = screen.getByTestId(CommandLineTestId.Input);
      await user.type(input, "@Bui");
      await user.click(screen.getByTestId(`${CommandLineTestId.MentionItem}-agent-builder`));
      expect(input).toHaveValue("@Builder ");
    });

    it("reserves bottom padding on the textarea so text never slides under the overlaid controls", () => {
      render(<CommandLine onSubmit={vi.fn()} />);
      const input = screen.getByTestId(CommandLineTestId.Input);
      expect(input.style.paddingBottom).not.toBe("");
      // The attach (+) and Send controls both live inside the same input container.
      expect(screen.getByTestId(CommandLineTestId.Attach)).toBeInTheDocument();
      expect(screen.getByTestId(CommandLineTestId.Send)).toBeInTheDocument();
    });

    it("defaults the attach button's glyph to plus", () => {
      render(<CommandLine onSubmit={vi.fn()} />);
      const svg = screen.getByTestId(CommandLineTestId.Attach).querySelector("svg");
      expect(svg?.innerHTML).toContain('d="M12 5v14M5 12h14"');
    });

    it("renders the attachIcon override instead of the default plus glyph", () => {
      render(<CommandLine attachIcon="pin" onSubmit={vi.fn()} />);
      const svg = screen.getByTestId(CommandLineTestId.Attach).querySelector("svg");
      expect(svg?.innerHTML).not.toContain('d="M12 5v14M5 12h14"');
    });
  });
});
