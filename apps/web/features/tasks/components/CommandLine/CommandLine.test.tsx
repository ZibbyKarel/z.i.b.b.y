import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
import { CommandLine, CommandLineTestId, mentionRanges } from "./CommandLine";

/** Marks are keyed per segment (`${Mark}-${start}`), so every rendered mark is
 *  selected by prefix — the same way `HighlightTextAreaField`'s own suite does it. */
const markPattern = new RegExp(`^${HighlightTextAreaFieldTestId.Mark}-`);

/**
 * Phase 118d: `CommandLine` is the GENERIC draft composer — text, `@`-mention target,
 * attachments, highlights, suggestions — firing `onSubmit` on Enter/Send. It no longer
 * knows about task-launch (scheduling, the loop path, the project scope, the
 * classification ack row); those moved to `TaskCommandLine` (`TaskCommandLine.test.tsx`
 * owns their coverage now). `onSubmit` is REQUIRED — every render below supplies one.
 */
// The `@` catalogs live in one hoisted, mutable fixture so a test can grow them
// (see the per-kind cap test); `afterEach` restores the defaults.
const fx = vi.hoisted(() => {
  const defaults = () => ({
    // "pm" is held by the active employee below, so it never lists on its own.
    agents: [
      { id: "builder", name: "Builder", glyph: "hammer" },
      { id: "koder", name: "Kodér" },
      { id: "pm", name: "PM" },
    ] as { id: string; name: string; glyph?: string }[],
    workflows: [{ id: "delivery", name: "Delivery", department: "dev" }],
    // Phase 91: only "dev" owns a workflow, "ops" owns none — so the roster filter
    // (≥1 owned workflow) has something real to exclude.
    departments: [
      { id: "dev", name: "Dev", color: "#f97316", state: "idle", tier2Count: 0, tier3Count: 0 },
      { id: "ops", name: "Ops", color: "#14b8a6", state: "idle", tier2Count: 0, tier3Count: 0 },
    ],
    // An `@` employee holds the "pm" position — picking it dispatches to that agent.
    employees: [{ id: "emp-ada", name: "Ada Lovelace", agentId: "pm", status: "active" }],
  });
  return { defaults, data: defaults() };
});
vi.mock("../../../agents/queries/useAgentsQuery", () => ({
  useAgentsQuery: () => ({ data: fx.data.agents }),
  getAgentsQueryKey: () => ["agents"],
}));
vi.mock("../../../workflows/queries/useWorkflowsQuery", () => ({
  useWorkflowsQuery: () => ({ data: fx.data.workflows }),
  getWorkflowsQueryKey: () => ["workflows"],
}));
vi.mock("../../../departments/queries/useDepartmentsQuery", () => ({
  useDepartmentsQuery: () => ({ data: fx.data.departments }),
}));
// `#` sources (tags, never dispatch targets) and the `/` skill catalog.
vi.mock("../../../teams", () => ({
  useTeamsQuery: () => ({ data: [{ id: "devrel", name: "DevRel" }] }),
}));
vi.mock("../../../companies", () => ({
  useCompaniesQuery: () => ({ data: [{ id: "acme", name: "Acme Corp" }] }),
}));
vi.mock("../../../projects", () => ({
  useProjectsQuery: () => ({ data: [{ id: "zibby", name: "Zibby Web" }] }),
}));
vi.mock("../../../skills", () => ({
  useSkillsQuery: () => ({ data: [{ id: "tdd", name: "Test Driven", glyph: "spark" }] }),
}));
vi.mock("../../../employees", () => ({
  useEmployeesQuery: () => ({ data: fx.data.employees }),
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
  afterEach(() => {
    fx.data = fx.defaults();
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
        screen.queryByTestId(`${CommandLineTestId.MentionItem}-workflow-delivery`),
      ).not.toBeInTheDocument();

      await user.click(screen.getByTestId(`${CommandLineTestId.MentionItem}-agent-builder`));

      // Phase 59: no top target chip any more — the picked `@Name` inline,
      // highlighted, is the only visible trace of the assigned target.
      expect(screen.queryByTestId(RETIRED_TARGET_CHIP_TESTID)).not.toBeInTheDocument();
      expect(input).toHaveValue("@Builder ");
      const marks = screen.getAllByTestId(markPattern);
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

      // Results order: Ada Lovelace (employee), Dev (department), Delivery, Builder,
      // Kodér — ArrowDown once lands on Dev.
      await user.keyboard("{ArrowDown}{Enter}");

      expect(input).toHaveFocus();
      expect(input).toHaveValue("@Dev ");
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
      await user.click(screen.getByTestId(`${CommandLineTestId.MentionItem}-workflow-delivery`));
      await user.type(input, "spusť to");

      await user.click(screen.getByTestId(CommandLineTestId.Send));
      expect(onSubmit).toHaveBeenCalledWith(
        "@Delivery spusť to",
        { kind: "workflow", id: "delivery", name: "Delivery", glyph: "flow" },
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

    it("a typed (not picked) known @Name resolves the target; deleting it clears it", () => {
      fx.data.workflows = [{ id: "coloring-book", name: "Coloring Book", department: "dev" }];
      const onTargetChange = vi.fn();
      render(<CommandLine onSubmit={vi.fn()} onTargetChange={onTargetChange} />);
      const input = screen.getByTestId(CommandLineTestId.Input);

      fireEvent.change(input, { target: { value: "run @Coloring Book now" } });
      expect(onTargetChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ kind: "workflow", id: "coloring-book", name: "Coloring Book" }),
      );

      fireEvent.change(input, { target: { value: "run now" } });
      expect(onTargetChange).toHaveBeenLastCalledWith(undefined);
    });

    it("a typed @Name resolves to the LONGEST known name, upgrading a shorter prefix", () => {
      fx.data.workflows = [
        { id: "coloring", name: "Coloring", department: "dev" },
        { id: "coloring-book", name: "Coloring Book", department: "dev" },
      ];
      const onTargetChange = vi.fn();
      render(<CommandLine onSubmit={vi.fn()} onTargetChange={onTargetChange} />);
      const input = screen.getByTestId(CommandLineTestId.Input);

      fireEvent.change(input, { target: { value: "@Coloring" } });
      expect(onTargetChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ kind: "workflow", id: "coloring" }),
      );
      fireEvent.change(input, { target: { value: "@Coloring Book" } });
      expect(onTargetChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ kind: "workflow", id: "coloring-book", name: "Coloring Book" }),
      );
    });

    it("a typed unrelated @Name never replaces a picked target", async () => {
      const onTargetChange = vi.fn();
      const user = userEvent.setup();
      render(<CommandLine onSubmit={vi.fn()} onTargetChange={onTargetChange} />);
      const input = screen.getByTestId(CommandLineTestId.Input);
      await user.type(input, "@Bui");
      await user.click(screen.getByTestId(`${CommandLineTestId.MentionItem}-agent-builder`));
      onTargetChange.mockClear();

      fireEvent.change(input, { target: { value: "@Builder and @Delivery" } });

      expect(onTargetChange).not.toHaveBeenCalled();
    });
  });

  describe("Phase 91 — department @-mentions (roster-only, explicit target)", () => {
    it("lists a roster-bearing department (≥1 owned workflow) as a colored-dot row, never a capability-less one", async () => {
      const user = userEvent.setup();
      render(<CommandLine onSubmit={vi.fn()} />);
      const input = screen.getByTestId(CommandLineTestId.Input);
      await user.type(input, "@");

      // "dev" owns the "delivery" workflow (mocked above) — it's dispatchable,
      // so it belongs in the picker.
      expect(
        screen.getByTestId(`${CommandLineTestId.MentionItem}-department-dev`),
      ).toBeInTheDocument();
      // "ops" owns nothing — mentioning it would only ever hit the 0-owned
      // validation reject, so it must never appear, at ANY query (including empty).
      expect(
        screen.queryByTestId(`${CommandLineTestId.MentionItem}-department-ops`),
      ).not.toBeInTheDocument();

      // The icon is a colored dot (the department's own brand color), not the usual
      // agent/workflow Tag+glyph chip.
      const dot = screen.getByTestId(`${CommandLineTestId.MentionItem}-department-dev-dot`);
      expect(dot).toHaveStyle({ background: "#f97316" });
    });

    it("filters the department row by query exactly like agents/workflows", async () => {
      const user = userEvent.setup();
      render(<CommandLine onSubmit={vi.fn()} />);
      const input = screen.getByTestId(CommandLineTestId.Input);
      await user.type(input, "@ops");

      // "ops" never matches the query either, because it's excluded from the
      // candidate list before filtering even runs.
      expect(screen.getByTestId(CommandLineTestId.MentionEmpty)).toBeInTheDocument();
    });

    it("selecting a department sets the explicit department target — the submit payload carries kind: department", async () => {
      const onSubmit = vi.fn();
      const user = userEvent.setup();
      render(<CommandLine onSubmit={onSubmit} />);
      const input = screen.getByTestId(CommandLineTestId.Input);
      await user.type(input, "@Dev");
      await user.click(screen.getByTestId(`${CommandLineTestId.MentionItem}-department-dev`));

      expect(input).toHaveValue("@Dev ");
      await user.type(input, "dispatch this to the department");
      await user.click(screen.getByTestId(CommandLineTestId.Send));

      expect(onSubmit).toHaveBeenCalledWith(
        "@Dev dispatch this to the department",
        { kind: "department", id: "dev", name: "Dev", glyph: "grid" },
        undefined,
      );
    });
  });

  describe("trigger table — # scope, / skill, @ employee", () => {
    it("opens no # picker unless the host passes scopeKinds", async () => {
      const user = userEvent.setup();
      render(<CommandLine onSubmit={vi.fn()} />);
      await user.type(screen.getByTestId(CommandLineTestId.Input), "#");
      expect(screen.queryByTestId(CommandLineTestId.MentionMenu)).not.toBeInTheDocument();
    });

    it("# lists only the offered kinds; picking tags the scope as ONE multi-word token, deleting it clears the tag", async () => {
      const onScopeChange = vi.fn();
      const onTargetChange = vi.fn();
      const user = userEvent.setup();
      render(
        <CommandLine
          onScopeChange={onScopeChange}
          onSubmit={vi.fn()}
          onTargetChange={onTargetChange}
          scopeKinds={["project"]}
        />,
      );
      const input = screen.getByTestId(CommandLineTestId.Input);
      await user.type(input, "#");

      expect(
        screen.getByTestId(`${CommandLineTestId.MentionItem}-project-zibby`),
      ).toBeInTheDocument();
      expect(
        screen.queryByTestId(`${CommandLineTestId.MentionItem}-team-devrel`),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByTestId(`${CommandLineTestId.MentionItem}-company-acme`),
      ).not.toBeInTheDocument();

      await user.click(screen.getByTestId(`${CommandLineTestId.MentionItem}-project-zibby`));
      expect(input).toHaveValue("#Zibby Web ");
      expect(onScopeChange).toHaveBeenCalledWith("project", "zibby");
      expect(onTargetChange).not.toHaveBeenCalled();
      const marks = screen.getAllByTestId(markPattern);
      expect(marks.find((m) => m.textContent === "#Zibby Web")).toHaveClass("bg-risk-push/[0.14]");

      await user.clear(input);
      expect(onScopeChange).toHaveBeenLastCalledWith("project", undefined);
    });

    it("@ never lists teams, even when the host offers # teams", async () => {
      const user = userEvent.setup();
      render(<CommandLine onSubmit={vi.fn()} scopeKinds={["team"]} />);
      await user.type(screen.getByTestId(CommandLineTestId.Input), "@");
      expect(
        screen.queryByTestId(`${CommandLineTestId.MentionItem}-team-devrel`),
      ).not.toBeInTheDocument();
    });

    it("@ lists an active employee and picking it targets the employee's agent", async () => {
      const onTargetChange = vi.fn();
      const user = userEvent.setup();
      render(<CommandLine onSubmit={vi.fn()} onTargetChange={onTargetChange} />);
      const input = screen.getByTestId(CommandLineTestId.Input);
      await user.type(input, "@Ada");
      await user.click(screen.getByTestId(`${CommandLineTestId.MentionItem}-employee-emp-ada`));

      expect(input).toHaveValue("@Ada Lovelace ");
      expect(onTargetChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ kind: "agent", id: "pm", name: "Ada Lovelace" }),
      );
    });

    it("an empty @ query shows every kind even when each has >12 entries, and never lists a held agent separately", async () => {
      const many = <T,>(make: (i: number) => T) => Array.from({ length: 20 }, (_, i) => make(i));
      fx.data.employees = many((i) => ({
        id: `emp-${i}`,
        name: `Employee ${i}`,
        agentId: `held-${i}`,
        status: "active",
      }));
      fx.data.departments = many((i) => ({
        id: `dep-${i}`,
        name: `Department ${i}`,
        color: "#f97316",
        state: "idle",
        tier2Count: 0,
        tier3Count: 0,
      }));
      fx.data.workflows = many((i) => ({
        id: `wf-${i}`,
        name: `Workflow ${i}`,
        department: `dep-${i}`,
      }));
      fx.data.agents = [
        ...many((i) => ({ id: `held-${i}`, name: `Held ${i}` })),
        ...many((i) => ({ id: `free-${i}`, name: `Free ${i}` })),
      ];
      const user = userEvent.setup();
      render(<CommandLine onSubmit={vi.fn()} />);
      await user.type(screen.getByTestId(CommandLineTestId.Input), "@");

      for (const id of ["employee-emp-0", "department-dep-0", "workflow-wf-0", "agent-free-0"]) {
        expect(screen.getByTestId(`${CommandLineTestId.MentionItem}-${id}`)).toBeInTheDocument();
      }
      expect(
        screen.queryByTestId(`${CommandLineTestId.MentionItem}-agent-held-0`),
      ).not.toBeInTheDocument();
      // 12 per kind on an empty query.
      expect(
        screen.queryByTestId(`${CommandLineTestId.MentionItem}-employee-emp-12`),
      ).not.toBeInTheDocument();
    });

    it("opens no / picker unless allowSkillMentions is set", async () => {
      const user = userEvent.setup();
      render(<CommandLine onSubmit={vi.fn()} />);
      await user.type(screen.getByTestId(CommandLineTestId.Input), "/");
      expect(screen.queryByTestId(CommandLineTestId.MentionMenu)).not.toBeInTheDocument();
    });

    it("/ picks a skill and a reset submit clears it", async () => {
      const onSkillChange = vi.fn();
      const user = userEvent.setup();
      render(<CommandLine allowSkillMentions onSkillChange={onSkillChange} onSubmit={vi.fn()} />);
      const input = screen.getByTestId(CommandLineTestId.Input);
      await user.type(input, "/Tes");
      await user.click(screen.getByTestId(`${CommandLineTestId.MentionItem}-skill-tdd`));
      expect(input).toHaveValue("/Test Driven ");
      expect(onSkillChange).toHaveBeenCalledWith("tdd");

      await user.type(input, "go{Enter}");
      expect(onSkillChange).toHaveBeenLastCalledWith(undefined);
    });

    it.each(["see ~/zibby/x", "a/b"])(
      "a mid-word / (%s) opens no menu, even with skills on",
      async (value) => {
        const user = userEvent.setup();
        render(<CommandLine allowSkillMentions onSubmit={vi.fn()} />);
        await user.type(screen.getByTestId(CommandLineTestId.Input), value);
        expect(screen.queryByTestId(CommandLineTestId.MentionMenu)).not.toBeInTheDocument();
      },
    );

    it("Enter with the picker open but zero results submits instead of being swallowed", async () => {
      const onSubmit = vi.fn();
      const user = userEvent.setup();
      render(<CommandLine allowSkillMentions onSubmit={onSubmit} />);
      await user.type(screen.getByTestId(CommandLineTestId.Input), "/zzz");
      expect(screen.getByTestId(CommandLineTestId.MentionEmpty)).toBeInTheDocument();

      await user.keyboard("{Enter}");
      expect(onSubmit).toHaveBeenCalledWith("/zzz", undefined, undefined);
      expect(screen.queryByTestId(CommandLineTestId.MentionMenu)).toBeNull();
    });

    it("closes the empty picker on Enter-submit even when the draft is kept (resetOnSubmit={false})", async () => {
      const onSubmit = vi.fn();
      const user = userEvent.setup();
      render(<CommandLine allowSkillMentions onSubmit={onSubmit} resetOnSubmit={false} />);
      await user.type(screen.getByTestId(CommandLineTestId.Input), "/zzz");
      await user.keyboard("{Enter}");
      expect(onSubmit).toHaveBeenCalledTimes(1);
      expect(screen.queryByTestId(CommandLineTestId.MentionMenu)).toBeNull();
    });
  });

  describe("mentionRanges", () => {
    const all = new Set(["@", "#", "/"] as const);

    it("matches the longest known name, so a multi-word name is ONE range", () => {
      expect(
        mentionRanges(
          "go @Coloring Book now",
          [
            { trigger: "@", name: "Coloring", tone: "accent" },
            { trigger: "@", name: "Coloring Book", tone: "push" },
          ],
          all,
        ),
      ).toEqual([{ start: 3, end: 17, tone: "push" }]);
    });

    it("never marks an unknown / token or a path", () => {
      expect(mentionRanges("x /Users/me", [], all)).toEqual([]);
    });

    it("renders an unknown @token dim", () => {
      expect(mentionRanges("@file.txt", [], all)).toEqual([{ start: 0, end: 9, tone: "dim" }]);
    });

    it("skips a disabled trigger", () => {
      expect(
        mentionRanges(
          "#Acme Corp",
          [{ trigger: "#", name: "Acme Corp", tone: "push" }],
          new Set(["@"] as const),
        ),
      ).toEqual([]);
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

  describe("D-020 — multipleTargets mode (chat's multi-mention picker)", () => {
    it("picking several units appends removable chips instead of replacing a single target", async () => {
      const user = userEvent.setup();
      render(<CommandLine multipleTargets onSubmit={vi.fn()} />);
      const input = screen.getByTestId(CommandLineTestId.Input);

      await user.type(input, "@Bui");
      await user.click(screen.getByTestId(`${CommandLineTestId.MentionItem}-agent-builder`));
      await user.type(input, "@Dev");
      await user.click(screen.getByTestId(`${CommandLineTestId.MentionItem}-department-dev`));

      expect(
        screen.getByTestId(`${CommandLineTestId.MentionChip}-agent-builder`),
      ).toHaveTextContent("Builder");
      expect(
        screen.getByTestId(`${CommandLineTestId.MentionChip}-department-dev`),
      ).toHaveTextContent("Dev");
    });

    it("submit passes the full mentions list as the 4th onSubmit arg, target stays undefined", async () => {
      const onSubmit = vi.fn();
      const user = userEvent.setup();
      render(<CommandLine multipleTargets onSubmit={onSubmit} />);
      const input = screen.getByTestId(CommandLineTestId.Input);
      await user.type(input, "@Bui");
      await user.click(screen.getByTestId(`${CommandLineTestId.MentionItem}-agent-builder`));
      await user.type(input, "@Dev");
      await user.click(screen.getByTestId(`${CommandLineTestId.MentionItem}-department-dev`));
      await user.type(input, "rozděl to");
      await user.click(screen.getByTestId(CommandLineTestId.Send));

      expect(onSubmit).toHaveBeenCalledWith("@Builder @Dev rozděl to", undefined, undefined, [
        { kind: "agent", id: "builder", name: "Builder", glyph: "hammer" },
        { kind: "department", id: "dev", name: "Dev", glyph: "grid" },
      ]);
    });

    it("submits with mentions undefined (not an empty array) when nothing was picked", async () => {
      const onSubmit = vi.fn();
      const user = userEvent.setup();
      render(<CommandLine multipleTargets onSubmit={onSubmit} />);
      await user.type(screen.getByTestId(CommandLineTestId.Input), "ahoj");
      await user.click(screen.getByTestId(CommandLineTestId.Send));
      expect(onSubmit).toHaveBeenCalledWith("ahoj", undefined, undefined, undefined);
    });

    it("removing a chip clears both the picked state and its @Name from the text", async () => {
      const onSubmit = vi.fn();
      const user = userEvent.setup();
      render(<CommandLine multipleTargets onSubmit={onSubmit} />);
      const input = screen.getByTestId(CommandLineTestId.Input);
      await user.type(input, "@Bui");
      await user.click(screen.getByTestId(`${CommandLineTestId.MentionItem}-agent-builder`));
      await user.type(input, "@Dev");
      await user.click(screen.getByTestId(`${CommandLineTestId.MentionItem}-department-dev`));

      const { ChipTestId } = await import("@zibby/design-system");
      const builderChip = screen.getByTestId(`${CommandLineTestId.MentionChip}-agent-builder`);
      await user.click(within(builderChip).getByTestId(ChipTestId.Close));

      expect(
        screen.queryByTestId(`${CommandLineTestId.MentionChip}-agent-builder`),
      ).not.toBeInTheDocument();
      expect(input).toHaveValue("@Dev ");

      await user.type(input, "shrň");
      await user.click(screen.getByTestId(CommandLineTestId.Send));
      expect(onSubmit).toHaveBeenCalledWith("@Dev shrň", undefined, undefined, [
        { kind: "department", id: "dev", name: "Dev", glyph: "grid" },
      ]);
    });

    it("deleting a chip's @Name out of the text clears it, same as single-target reconciliation", async () => {
      const user = userEvent.setup();
      render(<CommandLine multipleTargets onSubmit={vi.fn()} />);
      const input = screen.getByTestId(CommandLineTestId.Input);
      await user.type(input, "@Bui");
      await user.click(screen.getByTestId(`${CommandLineTestId.MentionItem}-agent-builder`));
      expect(
        screen.getByTestId(`${CommandLineTestId.MentionChip}-agent-builder`),
      ).toBeInTheDocument();

      await user.clear(input);

      expect(
        screen.queryByTestId(`${CommandLineTestId.MentionChip}-agent-builder`),
      ).not.toBeInTheDocument();
    });

    it("resets the chip row after a successful submit (resetOnSubmit default true)", async () => {
      const user = userEvent.setup();
      render(<CommandLine multipleTargets onSubmit={vi.fn()} />);
      const input = screen.getByTestId(CommandLineTestId.Input);
      await user.type(input, "@Bui");
      await user.click(screen.getByTestId(`${CommandLineTestId.MentionItem}-agent-builder`));
      await user.type(input, "ahoj");
      await user.click(screen.getByTestId(CommandLineTestId.Send));

      expect(
        screen.queryByTestId(`${CommandLineTestId.MentionChip}-agent-builder`),
      ).not.toBeInTheDocument();
    });

    it("every OTHER caller's onSubmit signature is unaffected (target still flows in single mode)", async () => {
      const onSubmit = vi.fn();
      const user = userEvent.setup();
      render(<CommandLine onSubmit={onSubmit} />);
      const input = screen.getByTestId(CommandLineTestId.Input);
      await user.type(input, "@Bui");
      await user.click(screen.getByTestId(`${CommandLineTestId.MentionItem}-agent-builder`));
      await user.type(input, "ahoj");
      await user.click(screen.getByTestId(CommandLineTestId.Send));
      expect(onSubmit).toHaveBeenCalledWith(
        "@Builder ahoj",
        { kind: "agent", id: "builder", name: "Builder", glyph: "hammer" },
        undefined,
      );
    });
  });

  describe("Phase 31a — velin-b chrome, drag overlay, mention tones, suggestions", () => {
    it("wraps the input in the panel chrome by default (header icon + label + hint)", () => {
      render(<CommandLine onSubmit={vi.fn()} />);
      expect(screen.getByTestId(PanelTestId.Header)).toHaveTextContent("Zadej směr");
      // The hint only names the triggers this render actually offers.
      expect(screen.getByTestId(PanelTestId.Header).parentElement).toHaveTextContent(
        "@ zaměstnanci, oddělení, workflow · přetáhni soubor, nebo použij sponku",
      );
      expect(screen.queryByText(/skilly/)).not.toBeInTheDocument();
    });

    it("the chrome hint names every offered trigger and scope kind", () => {
      render(
        <CommandLine
          allowSkillMentions
          onSubmit={vi.fn()}
          scopeKinds={["company", "team", "project"]}
        />,
      );
      expect(
        screen.getByText(
          "@ zaměstnanci, oddělení, workflow · # firmy, týmy, projekty · / skilly · přetáhni soubor, nebo použij sponku",
        ),
      ).toBeInTheDocument();
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
      const marks = await screen.findAllByTestId(markPattern);
      expect(marks.map((m) => m.textContent).join("")).toContain("/tmp/scratch/widget");
    });

    it("tints @mentions by resolved type — a known agent accent, a known workflow push, an unresolved token dim", () => {
      render(<CommandLine onSubmit={vi.fn()} />);
      // A single `change` (rather than typing character-by-character) — typing a
      // literal `@` triggers the mention picker, which steals focus to its own
      // search input; this test only cares what the final text renders as, not the
      // picker's own UX (already covered by the "@ mention picker" describe above).
      fireEvent.change(screen.getByTestId(CommandLineTestId.Input), {
        target: { value: "@Builder a @Delivery a @report.md" },
      });

      const marks = screen.getAllByTestId(markPattern);
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
