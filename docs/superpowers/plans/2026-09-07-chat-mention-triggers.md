# Chat Mention Triggers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the composer's single `@` mention trigger into three — `@` picks WHO runs the turn (agents/pipelines/subsystems), `/` picks WHICH ZIBBY skill the turn runs (dispatched for real through the chat send contract), `#` picks WHAT knowledge base it may read (teams).

**Architecture:** One generalised trigger engine inside `CommandLine` — a boundary-anchored regex captures the trigger char, and a single `mentionResults` memo switches on it to produce that trigger's rows; each trigger is independently opt-in per host, and a disabled trigger never opens a picker at all. `/` adds a fourth resolution kind (`skill`) that, like `team`, resolves to a scope-ish tag rather than a `TaskTarget`; `ChatDock` mirrors it into the send body as a new optional `skillId`, which `ChatSessionService` resolves against the file-backed skills store and folds into the turn's `--append-system-prompt` — the same mechanism the persona and the explicit-target note already use (the chat turn runs with `--tools ""` and `--setting-sources ""`, so there is no native Skill tool to reach for).

**Tech Stack:** Next.js 15 App Router + React 19, TanStack Query, `@zibby/design-system`, next-intl, NestJS + ts-rest, Zod (`libs/contracts`), Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/todo-9.md`

## Global Constraints

- Contract-first: a change to the HTTP surface lands in `libs/contracts` (Zod schema + contract) with its schema test BEFORE the NestJS implementation.
- `strict: true` + `noUncheckedIndexedAccess`. No `any`. No `forwardRef` (React 19 ref-as-prop).
- `apps/web` composes DS primitives only — no new Tailwind classes in the app, no inline `style={{…}}` on a DOM element (ESLint `react/forbid-dom-props`); existing `style` passthroughs on DS components stay as they are.
- Tests select via `data-testid` (the `CommandLineTestId` / `ChatDockTestId` enums); roles and ARIA stay as assertions only.
- Every new user-visible string is added to BOTH `apps/web/i18n/messages/cs.json` and `apps/web/i18n/messages/en.json`. Default locale is `cs`.
- Per-trigger availability is **opt-in** (`false` default) and stated explicitly at every call site, per the rule in `CommandLine`'s `allowTeamMentions` docblock: never offer a mention whose pick cannot reach a run.
- After each edited file: `pnpm exec prettier --write <file>` then `pnpm exec eslint --fix <file>`. Run only the touched test files, scoped (`pnpm exec vitest run <path> --project web` / `--project api`) — never the repo-wide `pnpm test` / `check:*` mid-task.
- Companies are OUT of scope (spec decision 2): `#` searches teams only.
- `@` keeps agents + pipelines + subsystems (spec decision 3). Only teams move off it.
- Commit after every task with a conventional-commit subject in English.

---

### Task 1: Contract — `skillId` on the chat send body

**Files:**
- Modify: `libs/contracts/src/chat/chat.schema.ts:82-102`
- Modify: `libs/contracts/src/chat/chat.contract.ts:1-37`
- Test: `libs/contracts/src/chat/chat.schema.test.ts` (append a describe block)

**Interfaces:**
- Consumes: nothing.
- Produces: `SendChatMessageBodySchema` gains `skillId?: string` validated by `SkillIdSchema`; `chatContract.sendMessage.responses` gains `404: ErrorSchema`. Task 2 and Task 6 both build on this.

- [ ] **Step 1: Write the failing schema tests**

Append to `libs/contracts/src/chat/chat.schema.test.ts` (the file already imports `SendChatMessageBodySchema` for the `teamId` block at :87 — reuse that import, don't add a second one):

```ts
describe("SendChatMessageBodySchema.skillId (TODO 9 — the `/` trigger picks a skill)", () => {
  it("carries skillId alongside a target and a teamId", () => {
    const body = SendChatMessageBodySchema.parse({
      text: "shrň to",
      target: { kind: "agent", id: "builder", name: "Builder", glyph: "hammer" },
      teamId: "devrel",
      skillId: "code-review",
    });
    expect(body.skillId).toBe("code-review");
  });

  it("stays valid with no skillId (back-compatible)", () => {
    const body = SendChatMessageBodySchema.parse({ text: "x" });
    expect(body.skillId).toBeUndefined();
  });

  it("rejects a skillId that isn't a valid filename-safe id — proves it's SkillIdSchema, not a bare string", () => {
    const parsed = SendChatMessageBodySchema.safeParse({ text: "x", skillId: "../etc/passwd" });
    expect(parsed.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run libs/contracts/src/chat/chat.schema.test.ts`
Expected: FAIL — the first test's `body.skillId` is `undefined` (unknown key stripped) and the third parses successfully.

- [ ] **Step 3: Add the field to the schema**

In `libs/contracts/src/chat/chat.schema.ts`, add the import next to the existing `TeamIdSchema` one:

```ts
import { SkillIdSchema } from "../skills/skill.schema";
```

and add the field to `SendChatMessageBodySchema`, immediately after `teamId`:

```ts
  /**
   * TODO 9: the skill the operator picked with the composer's `/` trigger. A
   * third, independent axis beside `target` and `teamId`: `target` answers WHO a
   * dispatched `create_task` runs as, `teamId` WHAT knowledge base the turn may
   * read, and `skillId` WHICH ZIBBY skill's instructions the turn follows —
   * `ChatSessionService` resolves it against the skills store and folds the
   * skill's `instructions` into the turn's `--append-system-prompt`. An id with
   * no skill file behind it is a 404, never a silently ignored field.
   */
  skillId: SkillIdSchema.optional(),
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run libs/contracts/src/chat/chat.schema.test.ts`
Expected: PASS (all three new tests plus the existing `teamId` block).

- [ ] **Step 5: Add the 404 response to the contract**

In `libs/contracts/src/chat/chat.contract.ts`, add the `ErrorSchema` import:

```ts
import { ErrorSchema } from "../common.schema";
```

and widen `sendMessage`'s responses:

```ts
      responses: { 201: SendChatMessageResultSchema, 404: ErrorSchema },
```

with a line in the router's docblock:

```
 * A `skillId` naming no existing skill is a 404 — the turn is never started with
 * a silently dropped skill (see `SendChatMessageBodySchema.skillId`).
```

- [ ] **Step 6: Verify the contract still typechecks and commit**

Run: `pnpm exec tsc -p libs/contracts/tsconfig.lib.json --noEmit`
Expected: no errors.

```bash
pnpm exec prettier --write libs/contracts/src/chat/chat.schema.ts libs/contracts/src/chat/chat.contract.ts libs/contracts/src/chat/chat.schema.test.ts
pnpm exec eslint --fix libs/contracts/src/chat/chat.schema.ts libs/contracts/src/chat/chat.contract.ts libs/contracts/src/chat/chat.schema.test.ts
git add libs/contracts/src/chat/
git commit -m "feat(contracts): carry a picked skillId on the chat send body"
```

---

### Task 2: API — resolve the picked skill and fold it into the turn's prompt

**Files:**
- Modify: `apps/api/src/chat/chat-session.service.ts:73-88` (constructor), `:97-123` (`sendMessage`), `:126-170` (`buildArgs`), `:270-283` (`runTurn`)
- Modify: `apps/api/src/chat/chat.module.ts`
- Modify: `apps/api/src/chat/chat.controller.ts:25-32`
- Test: `apps/api/src/chat/chat-session.service.test.ts` (harness + a new describe block)

**Interfaces:**
- Consumes: `SendChatMessageBodySchema.skillId` and `chatContract.sendMessage`'s `404` from Task 1.
- Produces: nothing the web tasks depend on beyond Task 1's contract. `ChatSessionService`'s constructor gains a 8th parameter `skills: SkillsStorageService` (appended last, so every existing positional construction keeps working); `buildArgs(text, sessionId, conversationId, teamId?, skill?)` gains a 5th parameter `skill?: { name: string; instructions: string }`; `runTurn(conversationId, turnId, text, now?, teamId?, skill?)` likewise.

- [ ] **Step 1: Extend the test harness so a TestSession can own a real skills dir**

In `apps/api/src/chat/chat-session.service.test.ts`, add the import beside the existing `KbMcpAuthService` one:

```ts
import { SkillsStorageService } from "../skills/skills.storage.service";
```

and add a final constructor parameter to `TestSession`, after `kbMcpAuth`, forwarding it to `super`:

```ts
    // TODO 9: the skills store the `/`-picked skill is resolved against. Defaults
    // to the OS tmp dir — every test that actually picks a skill constructs its
    // own dir and writes a `<id>.md` into it (see the "picked skill" block below).
    skills: SkillsStorageService = new SkillsStorageService(os.tmpdir()),
```

```ts
    super(
      store,
      events,
      fakeSystemConfigStore({ chatPersona: persona }),
      toolResults,
      mcpAuth,
      chatDir,
      kbMcpAuth,
      skills,
    );
```

- [ ] **Step 2: Write the failing tests**

Add this as a NESTED describe INSIDE the existing top-level `describe("ChatSessionService", …)` (it opens at `chat-session.service.test.ts:119` and closes at :610) — insert it just before that block's final `});`. It must not go at file level: `store`, `events` and `settled` are declared inside that describe, so a file-level block would not compile. `fs`, `os`, `path`, `line` and `NOW` are module-level and resolve either way.

```ts
describe("TODO 9 — a picked skill reaches the turn's prompt", () => {
  /** A skills dir holding one real `code-review.md`, the way the store expects it. */
  async function skillsDirWithCodeReview(): Promise<SkillsStorageService> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "zibby-skills-"));
    await fs.writeFile(
      path.join(dir, "code-review.md"),
      "---\nname: Code Review\n---\n\nReview the diff and report findings.\n",
      "utf8",
    );
    return new SkillsStorageService(dir);
  }

  it("appends the skill's instructions to --append-system-prompt", async () => {
    const svc = new TestSession(
      store,
      events,
      [],
      "jarvis",
      new ChatToolResultRegistry(),
      new ChatMcpAuthService(),
      os.tmpdir(),
      new KbMcpAuthService(),
      await skillsDirWithCodeReview(),
    );
    const args = await svc.buildArgs("projdi to", null, "c1", undefined, {
      name: "Code Review",
      instructions: "Review the diff and report findings.",
    });
    const prompt = args[args.indexOf("--append-system-prompt") + 1] ?? "";

    expect(prompt).toContain("Review the diff and report findings.");
    expect(prompt).toContain("Code Review");
    // The persona is still there — a skill AUGMENTS the governor, never replaces it.
    expect(prompt).toContain(CHAT_GOVERNOR_PROMPT);
  });

  it("leaves the prompt exactly as-is when the turn carries no skill", async () => {
    const svc = new TestSession(store, events, [], "jarvis", new ChatToolResultRegistry());
    const args = await svc.buildArgs("ahoj", null, "c1");
    const prompt = args[args.indexOf("--append-system-prompt") + 1] ?? "";

    expect(prompt).toContain(CHAT_GOVERNOR_PROMPT);
    expect(prompt).not.toContain("skill");
  });

  it("threads body.skillId from sendMessage through runTurn into the prompt", async () => {
    const svc = new TestSession(
      store,
      events,
      [
        line({ type: "system", subtype: "init", session_id: "s" }),
        line({ type: "result", is_error: false, result: "ok" }),
      ],
      "jarvis",
      new ChatToolResultRegistry(),
      new ChatMcpAuthService(),
      os.tmpdir(),
      new KbMcpAuthService(),
      await skillsDirWithCodeReview(),
    );
    const result = await svc.sendMessage(
      { conversationId: "c-skill-1", text: "projdi to", skillId: "code-review" },
      NOW,
    );
    await settled(result.turnId);

    const prompt = svc.lastArgs[svc.lastArgs.indexOf("--append-system-prompt") + 1] ?? "";
    expect(prompt).toContain("Review the diff and report findings.");
  });

  it("throws for an unknown skillId — and appends NO user message, so a bad id never mutates the transcript", async () => {
    const svc = new TestSession(
      store,
      events,
      [],
      "jarvis",
      new ChatToolResultRegistry(),
      new ChatMcpAuthService(),
      os.tmpdir(),
      new KbMcpAuthService(),
      await skillsDirWithCodeReview(),
    );

    await expect(
      svc.sendMessage({ conversationId: "c-skill-2", text: "projdi to", skillId: "nope" }, NOW),
    ).rejects.toBeInstanceOf(SkillNotFoundError);

    const transcript = await store.readTranscript("c-skill-2");
    expect(transcript.messages).toHaveLength(0);
  });
});
```

Add the error import at the top of the test file:

```ts
import { SkillNotFoundError } from "../skills/skills.errors";
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm exec vitest run apps/api/src/chat/chat-session.service.test.ts --project api`
Expected: FAIL — `super(...)` rejects the 8th argument, `buildArgs` rejects the 5th, `sendMessage` ignores `skillId`.

- [ ] **Step 4: Wire the skills store into the service**

In `apps/api/src/chat/chat-session.service.ts` add the import:

```ts
import { SkillsStorageService } from "../skills/skills.storage.service";
```

and the constructor parameter, last:

```ts
    // TODO 9: the file-backed skills catalog. A `/`-picked `skillId` is resolved
    // here BEFORE the turn starts, so an id with no file behind it fails the
    // request outright (mapped to a 404 by `ChatController`) instead of starting a
    // turn whose skill silently did nothing.
    private readonly skills: SkillsStorageService,
```

- [ ] **Step 5: Resolve the skill in `sendMessage` and thread it through**

Replace `sendMessage`'s body (`apps/api/src/chat/chat-session.service.ts:97-123`) so the resolution happens FIRST:

```ts
  async sendMessage(
    body: SendChatMessageBody,
    now: Date = new Date(),
  ): Promise<SendChatMessageResult> {
    // TODO 9: resolve BEFORE anything is created or appended — a `skillId` with no
    // skill file behind it must fail the request without minting a conversation or
    // leaving an orphan user turn in the transcript. `SkillsStorageService.get`
    // throws `SkillNotFoundError` / `InvalidSkillIdError`; `ChatController` maps
    // both to a 404.
    const picked = body.skillId ? await this.skills.get(body.skillId) : undefined;
    const skill = picked
      ? { name: picked.name ?? picked.id, instructions: picked.instructions }
      : undefined;

    const conversationId = await this.store.ensureConversation(body.conversationId, now);
    if (body.target) this.toolResults.setExplicitTarget(conversationId, body.target);
    const userMessage: ChatMessage = {
      id: collisionResistantId("msg"),
      role: "user",
      text: body.text,
      at: now.toISOString(),
    };
    await this.store.appendMessage(conversationId, userMessage);

    const turnId = collisionResistantId("turn");
    void this.runTurn(conversationId, turnId, body.text, undefined, body.teamId, skill).catch(
      (error) => {
        this.logger.error(`chat turn ${turnId} failed: ${String(error)}`);
        this.events.emit({ conversationId, turnId, type: "error", message: "Něco se pokazilo." });
      },
    );

    return { conversationId, turnId };
  }
```

- [ ] **Step 6: Compose the prompt in `buildArgs` and thread the parameter through `runTurn`**

Add the type just above the class (next to `ClaudeProcess`):

```ts
/** The `/`-picked skill for one turn, reduced to what the prompt needs. */
export interface ChatTurnSkill {
  name: string;
  instructions: string;
}
```

In `buildArgs`, add the parameter and compose the prompt:

```ts
  async buildArgs(
    text: string,
    sessionId: string | null,
    conversationId: string,
    teamId?: string,
    // TODO 9: the `/`-picked skill, already resolved by `sendMessage`.
    skill?: ChatTurnSkill,
  ): Promise<string[]> {
```

Replace the `const prompt = explicitTarget ? … : persona;` expression with:

```ts
    const targeted = explicitTarget
      ? `${persona}\n\nOperátor v této zprávě výslovně oslovil ${describeTarget(explicitTarget)} ` +
        "(@mention). Pokud zavoláš create_task, tato volba už má přednost před klasifikací — " +
        "nemusíš znovu vybírat cíl."
      : persona;
    // TODO 9: the `/`-picked skill's instructions ride in the SAME
    // `--append-system-prompt` the persona does — the chat turn runs with
    // `--tools ""` and `--setting-sources ""`, so there is no native Skill tool to
    // invoke; the prompt is the mechanism. It AUGMENTS the governor (appended
    // after it), never replaces it.
    const prompt = skill
      ? `${targeted}\n\nOperátor pro tuto zprávu vybral skill "${skill.name}" (/mention). ` +
        `Řiď se jeho instrukcemi:\n\n${skill.instructions}`
      : targeted;
```

In `runTurn`, add the parameter after `teamId` and pass it on:

```ts
    teamId?: string,
    // TODO 9: the resolved `/`-picked skill, threaded straight into `buildArgs`
    // the same explicit-parameter way `teamId` is.
    skill?: ChatTurnSkill,
  ): Promise<void> {
    const sessionId = await this.store.getSessionId(conversationId);
    const proc = this.createProcess(
      await this.buildArgs(text, sessionId, conversationId, teamId, skill),
    );
```

- [ ] **Step 7: Import `SkillsModule` into `ChatModule`**

In `apps/api/src/chat/chat.module.ts` add the import and the module entry:

```ts
import { SkillsModule } from "../skills/skills.module";
```

```ts
  imports: [
    TasksModule,
    MemoryModule,
    BriefingModule,
    MachineModule,
    SubsystemsModule,
    KbModule,
    // TODO 9: `ChatSessionService` resolves a `/`-picked `skillId` against
    // `SkillsStorageService`. `SkillsModule` imports nothing, so this is a leaf
    // edge — no cycle.
    SkillsModule,
  ],
```

- [ ] **Step 8: Map the resolution failure to a 404 in the controller**

In `apps/api/src/chat/chat.controller.ts` add:

```ts
import { InvalidSkillIdError, SkillNotFoundError } from "../skills/skills.errors";
```

and replace the `sendMessage` handler:

```ts
      // TODO 9: an unknown/unsafe `skillId` surfaces as a 404 rather than a 500 —
      // `ChatSessionService.sendMessage` resolves the skill before it touches the
      // transcript, so nothing has been created when this fires.
      sendMessage: async ({ body }) => {
        try {
          return { status: 201 as const, body: await this.session.sendMessage(body) };
        } catch (error) {
          if (error instanceof SkillNotFoundError || error instanceof InvalidSkillIdError) {
            return {
              status: 404 as const,
              body: { message: `Skill "${body.skillId ?? ""}" not found` },
            };
          }
          throw error;
        }
      },
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `pnpm exec vitest run apps/api/src/chat/chat-session.service.test.ts --project api`
Expected: PASS — the new block plus every pre-existing test in the file (the `teamId` cases still pass positionally).

- [ ] **Step 10: Commit**

```bash
pnpm exec prettier --write apps/api/src/chat/chat-session.service.ts apps/api/src/chat/chat.module.ts apps/api/src/chat/chat.controller.ts apps/api/src/chat/chat-session.service.test.ts
pnpm exec eslint --fix apps/api/src/chat/chat-session.service.ts apps/api/src/chat/chat.module.ts apps/api/src/chat/chat.controller.ts apps/api/src/chat/chat-session.service.test.ts
git add apps/api/src/chat/
git commit -m "feat(api): run a chat turn under a picked skill's instructions"
```

---

### Task 3: `CommandLine` — one generalised trigger engine, teams move to `#`

**Files:**
- Modify: `apps/web/features/tasks/components/CommandLine/CommandLine.tsx` (`MENTION_QUERY_RE`/`MENTION_RE`/`checkMention`/`mentionRanges`/`hasMentionFor` :215-285, `Mention` :202-206, `syncMention` :625-632, `mentionResults` :815-864, `pickMentionResult` :709-750, the row `Tag` tone :1105-1125, the mono label :1126-1128)
- Test: `apps/web/features/tasks/components/CommandLine/CommandLine.test.tsx` (the teams fixture, and the "Task 8 — team @-mentions" describe block at :273)
- Test: `apps/web/features/chat/components/ChatDock.test.tsx` (Step 9 — the four `@DevRel` occurrences in its "Task 8 fix round 1" block become `#DevRel`; this file is part of THIS task's commit)

Every line reference in this plan may drift by a line or three — grep for the quoted symbol or string rather than trusting the number.

**Interfaces:**
- Consumes: nothing.
- Test ids: no new `CommandLineTestId` member is needed and none is added (a deviation
  from spec R6's wording, ratified by the operator on 2026-09-07) — a row's
  test id is already `${CommandLineTestId.MentionItem}-${kind}-${id}`, so
  `-skill-code-review` / `-team-devrel` identify a trigger's rows unambiguously, and
  the single `MentionMenu` id stays the "is a picker open at all" selector every
  disabled-trigger test asserts against. Adding a per-trigger menu id would break
  every existing `MentionMenu` assertion for no new coverage.
- Produces: exported `type MentionTrigger = "@" | "/" | "#"`; `Mention` gains `trigger: MentionTrigger`; a `triggerEnabled(trigger)` gate inside the component; `allowTeamMentions` now gates the `#` trigger instead of a row inside `@`. Task 4 adds the `skill` kind on top of this engine; Task 5 rewrites the hint that describes these triggers.

- [ ] **Step 1: Write the failing tests**

First extend the teams fixture at the top of the file (:53-55) with a MULTI-WORD
team, which the reconciliation test below needs — every existing assertion keeps
using `devrel`:

```ts
vi.mock("../../../teams", () => ({
  useTeamsQuery: () => ({
    data: [
      { id: "devrel", name: "DevRel" },
      // TODO 9: a two-word name — the picked-value reconciliation must survive it.
      { id: "partner-portal", name: "Partner Portal" },
    ],
  }),
}));
```

Then replace the whole `describe("Task 8 — team @-mentions tag scope, never a routing target", …)` block (it starts at :273 — grep for the string rather than trusting the number) with the block below. Every assertion from the old block survives: each one is either carried over verbatim or re-reached through `#` instead of `@`, per spec R4 — nothing is deleted to make the suite pass. The one test that genuinely disappears is `"offers no team row at all when allowTeamMentions is left at its (opt-in) default"`, whose intent is strictly strengthened by the new `"opens no picker at all on `#`"` test that replaces it.

```ts
  describe("TODO 9 — `#` is the team trigger; `@` is routing only", () => {
    it("lists teams under `#`, never under `@`", async () => {
      const user = userEvent.setup();
      render(<CommandLine allowTeamMentions onSubmit={vi.fn()} />);
      const input = screen.getByTestId(CommandLineTestId.Input);

      await user.type(input, "@");
      expect(
        screen.queryByTestId(`${CommandLineTestId.MentionItem}-team-devrel`),
      ).not.toBeInTheDocument();
      expect(screen.getByTestId(`${CommandLineTestId.MentionItem}-agent-builder`)).toBeInTheDocument();

      await user.clear(input);
      await user.type(input, "#");
      expect(screen.getByTestId(`${CommandLineTestId.MentionItem}-team-devrel`)).toBeInTheDocument();
      expect(
        screen.queryByTestId(`${CommandLineTestId.MentionItem}-agent-builder`),
      ).not.toBeInTheDocument();
    });

    it("opens no picker at all on `#` when `allowTeamMentions` is left at its (opt-in) default", async () => {
      const user = userEvent.setup();
      render(<CommandLine onSubmit={vi.fn()} />);
      await user.type(screen.getByTestId(CommandLineTestId.Input), "#");

      // Not "an open menu with an empty note" — no menu: a host without the
      // trigger must not advertise a source it can't honor.
      expect(screen.queryByTestId(CommandLineTestId.MentionMenu)).not.toBeInTheDocument();
    });

    it("picking a team inserts the inline #Name and calls onTeamChange with its id — onTargetChange never fires", async () => {
      const onTargetChange = vi.fn();
      const onTeamChange = vi.fn();
      const user = userEvent.setup();
      render(
        <CommandLine
          allowTeamMentions
          onSubmit={vi.fn()}
          onTargetChange={onTargetChange}
          onTeamChange={onTeamChange}
        />,
      );
      const input = screen.getByTestId(CommandLineTestId.Input);
      await user.type(input, "#DevRel");
      await user.click(screen.getByTestId(`${CommandLineTestId.MentionItem}-team-devrel`));

      expect(input).toHaveValue("#DevRel ");
      expect(onTeamChange).toHaveBeenCalledWith("devrel");
      expect(onTargetChange).not.toHaveBeenCalled();
    });

    it("a team tag and an agent target co-exist independently in the same draft", async () => {
      const onSubmit = vi.fn();
      const onTeamChange = vi.fn();
      const user = userEvent.setup();
      render(<CommandLine allowTeamMentions onSubmit={onSubmit} onTeamChange={onTeamChange} />);
      const input = screen.getByTestId(CommandLineTestId.Input);
      await user.type(input, "#DevRel");
      await user.click(screen.getByTestId(`${CommandLineTestId.MentionItem}-team-devrel`));
      await user.type(input, "@Bui");
      await user.click(screen.getByTestId(`${CommandLineTestId.MentionItem}-agent-builder`));
      await user.type(input, "shrň to");
      await user.click(screen.getByTestId(CommandLineTestId.Send));

      expect(onSubmit).toHaveBeenCalledWith(
        "#DevRel @Builder shrň to",
        { kind: "agent", id: "builder", name: "Builder", glyph: "hammer" },
        undefined,
      );
      expect(onTeamChange).toHaveBeenCalledWith("devrel");
    });

    it("deleting the #Name out of the text clears the team tag", async () => {
      const onTeamChange = vi.fn();
      const user = userEvent.setup();
      render(<CommandLine allowTeamMentions onSubmit={vi.fn()} onTeamChange={onTeamChange} />);
      const input = screen.getByTestId(CommandLineTestId.Input);
      await user.type(input, "#DevRel");
      await user.click(screen.getByTestId(`${CommandLineTestId.MentionItem}-team-devrel`));
      onTeamChange.mockClear();

      await user.clear(input);

      expect(onTeamChange).toHaveBeenCalledWith(undefined);
    });

    it("gives the team row a distinct icon and tone from every routing row — Task 8 fix round 2, now across the two triggers", async () => {
      const user = userEvent.setup();
      render(<CommandLine allowTeamMentions onSubmit={vi.fn()} />);
      const input = screen.getByTestId(CommandLineTestId.Input);

      // The routing rows now live under a DIFFERENT trigger than the team row, so
      // the comparison captures the `@` rows' markup first, then reopens on `#`.
      // The assertion set is unchanged from Task 8 — only how the rows are reached.
      await user.type(input, "@");
      const agentIconMarkup = within(
        screen.getByTestId(`${CommandLineTestId.MentionItem}-agent-builder`),
      ).getByTestId(TagTestId.Icon).innerHTML;
      const pipelineIconMarkup = within(
        screen.getByTestId(`${CommandLineTestId.MentionItem}-pipeline-delivery`),
      ).getByTestId(TagTestId.Icon).innerHTML;

      await user.clear(input);
      await user.type(input, "#");
      const teamRow = screen.getByTestId(`${CommandLineTestId.MentionItem}-team-devrel`);

      // Tone: asserted on the rendered variant class (matching how the design
      // system's own Tag.test.tsx asserts tone), never on a raw colour value.
      const teamTag = within(teamRow).getByTestId(TagTestId.Root);
      expect(teamTag).toHaveClass("text-risk-send");
      expect(teamTag).not.toHaveClass("text-foreground-dim");
      expect(teamTag).not.toHaveClass("text-accent");
      expect(teamTag).not.toHaveClass("text-risk-push");

      // Icon: the actual rendered glyph markup, not just the prop passed in.
      const teamIconMarkup = within(teamRow).getByTestId(TagTestId.Icon).innerHTML;
      expect(teamIconMarkup).not.toBe(agentIconMarkup);
      expect(teamIconMarkup).not.toBe(pipelineIconMarkup);
    });

    it("submits with no target when only a team was picked — a team tag never becomes a dispatch destination", async () => {
      const onSubmit = vi.fn();
      const user = userEvent.setup();
      render(<CommandLine allowTeamMentions onSubmit={onSubmit} />);
      const input = screen.getByTestId(CommandLineTestId.Input);
      await user.type(input, "#DevRel");
      await user.click(screen.getByTestId(`${CommandLineTestId.MentionItem}-team-devrel`));
      await user.type(input, "co víme o partner portálu?");
      await user.click(screen.getByTestId(CommandLineTestId.Send));

      expect(onSubmit).toHaveBeenCalledWith(
        "#DevRel co víme o partner portálu?",
        undefined,
        undefined,
      );
    });

    it("keeps a picked MULTI-WORD name alive as the operator keeps typing", async () => {
      const onTeamChange = vi.fn();
      const user = userEvent.setup();
      render(<CommandLine allowTeamMentions onSubmit={vi.fn()} onTeamChange={onTeamChange} />);
      const input = screen.getByTestId(CommandLineTestId.Input);

      await user.type(input, "#Partner");
      await user.click(
        screen.getByTestId(`${CommandLineTestId.MentionItem}-team-partner-portal`),
      );
      expect(input).toHaveValue("#Partner Portal ");
      onTeamChange.mockClear();

      // The inserted token is `#Partner Portal` — two words. A reconciliation that
      // tokenized on whitespace would read the tag as deleted here and clear it.
      await user.type(input, "co víme?");

      expect(onTeamChange).not.toHaveBeenCalled();
    });

    it("a trigger char mid-token is not a trigger — a path never opens the `/` picker and a hex colour never opens `#`", async () => {
      const user = userEvent.setup();
      render(<CommandLine allowTeamMentions onSubmit={vi.fn()} />);
      const input = screen.getByTestId(CommandLineTestId.Input);

      await user.type(input, "apps/web");
      expect(screen.queryByTestId(CommandLineTestId.MentionMenu)).not.toBeInTheDocument();

      await user.clear(input);
      await user.type(input, "barva#f97316");
      expect(screen.queryByTestId(CommandLineTestId.MentionMenu)).not.toBeInTheDocument();
    });

    it("a path that STARTS a word does open the `/` picker on a host that offers it — documented, not accidental", async () => {
      const user = userEvent.setup();
      render(<CommandLine allowSkillMentions onSubmit={vi.fn()} />);

      // The boundary rule is "start of text or after whitespace", so ` /tmp` is
      // indistinguishable from a deliberate `/`-trigger at the keystroke level. The
      // picker opening here is the accepted cost of that rule (Escape closes it,
      // and typing on past the first segment's `/` closes it too); asserted so a
      // future change to the rule is a deliberate one, not a silent regression.
      await user.type(screen.getByTestId(CommandLineTestId.Input), "uprav /tmp");
      expect(screen.getByTestId(CommandLineTestId.MentionMenu)).toBeInTheDocument();

      await user.keyboard("{Escape}");
      expect(screen.queryByTestId(CommandLineTestId.MentionMenu)).not.toBeInTheDocument();
    });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run apps/web/features/tasks/components/CommandLine/CommandLine.test.tsx --project web`
Expected: FAIL — typing `#` opens nothing today, and teams still appear under `@`.

- [ ] **Step 3: Generalise trigger detection**

In `apps/web/features/tasks/components/CommandLine/CommandLine.tsx`, replace the `Mention` interface (:202-206) and `MENTION_QUERY_RE` + `checkMention` (:215-233) with:

```ts
/**
 * The composer's three triggers. Each answers a different question, which is why
 * they are separate characters rather than four kinds inside one list:
 * `@` = WHO runs the turn (agent/pipeline/subsystem → a `TaskTarget`),
 * `/` = WHICH ZIBBY skill it runs (TODO 9, wired in the next task),
 * `#` = WHAT knowledge base it may read (team → a scope tag).
 */
export type MentionTrigger = "@" | "/" | "#";

/** An in-progress `<trigger>query` the caret is currently sitting inside —
 * `start` is the index of the trigger char itself, so
 * `text.slice(start, caret)` is `<trigger>query`. */
interface Mention {
  trigger: MentionTrigger;
  query: string;
  start: number;
}

/**
 * Matches an in-progress `<trigger>query` immediately before the caret. The
 * trigger only counts at the start of the text or right after whitespace — that
 * boundary is load-bearing now that `/` and `#` are triggers: without it a path
 * (`apps/web`) would open the skills picker and a hex colour (`#f97316`) the
 * teams one on every keystroke.
 */
const MENTION_QUERY_RE = /(?:^|\s)([@/#])([\w.-]*)$/;

/** Re-derives the in-progress mention (or `null`) from the text up to the caret —
 * called on every change/click/keyup so the dropdown tracks the caret live, never
 * just the moment the trigger was typed. */
function checkMention(text: string, caret: number): Mention | null {
  const match = MENTION_QUERY_RE.exec(text.slice(0, caret));
  if (!match) return null;
  const trigger = match[1] as MentionTrigger;
  const raw = match[2] ?? "";
  return { trigger, query: raw.toLowerCase(), start: caret - trigger.length - raw.length };
}
```

- [ ] **Step 4: Widen the highlight / reconciliation scan to all three triggers**

Replace `MENTION_RE` (:251) and the two functions that use it (:256-285):

```ts
/** Every `<trigger>token` occurrence in the text, verbatim (no spaces) — same
 * start-of-text-or-whitespace boundary `MENTION_QUERY_RE` uses, so a `/segment`
 * INSIDE a path (`apps/web`) is never mistaken for a skill token. A path that
 * starts a word (` /tmp/scratch`) still matches here and overlaps the range
 * `extractPathRanges` emits for it; that is harmless because
 * `HighlightTextAreaField.buildSegments` sorts by `start` and coalesces overlaps
 * lower-start-wins under a stable sort, and `pathHighlights` precede
 * `mentionHighlights` in the concatenated array — so the path keeps its own tone.
 * The token itself is capture 1; `match[0]` may carry a leading space. */
const MENTION_RE = /(?:^|\s)([@/#]\S+)/g;

/** Per-type highlight tone for a detected token: a known agent name resolves
 * `accent`, a known pipeline name resolves `push`, and anything else (a skill, a
 * team, a dropped file, an unresolved name) resolves `dim`. */
function mentionRanges(
  text: string,
  agentNames: ReadonlySet<string>,
  pipelineNames: ReadonlySet<string>,
): HighlightRange[] {
  const ranges: HighlightRange[] = [];
  for (const match of text.matchAll(MENTION_RE)) {
    const token = match[1];
    if (match.index === undefined || token === undefined) continue;
    const start = match.index + match[0].length - token.length;
    const name = token.slice(1).toLowerCase();
    const tone: HighlightTone = agentNames.has(name)
      ? "accent"
      : pipelineNames.has(name)
        ? "push"
        : "dim";
    ranges.push({ start, end: start + token.length, tone });
  }
  return ranges;
}

/**
 * True when a `<trigger><name>` case-insensitive occurrence still appears in
 * `text` — the "still referenced" rule every picked value (target, team tag,
 * skill) is reconciled against in `handleChange`. Trigger-agnostic on purpose: a
 * `#DevRel` occurrence keeps the team tag alive, an `@Builder` one the target.
 *
 * Matches the whole inserted name INCLUDING its spaces, rather than reusing
 * `MENTION_RE`'s `\S+` token: a multi-word name ("Partner Portal", "Code
 * Review") inserts as `@Partner Portal ` / `/Code Review `, whose `\S+` token is
 * only `@Partner` — so a token-equality check would report the pick as gone on
 * the very next keystroke and silently clear it. Both ends are boundary-checked
 * (start-of-text-or-whitespace before the trigger, whitespace-or-end after the
 * name) so `@Forge` never satisfies a pick named `Forge Two`, and a `/` inside a
 * path never counts.
 */
function hasMentionFor(text: string, name: string): boolean {
  const haystack = text.toLowerCase();
  const needle = name.toLowerCase();
  for (const trigger of MENTION_TRIGGERS) {
    const token = `${trigger}${needle}`;
    for (let from = haystack.indexOf(token); from !== -1; from = haystack.indexOf(token, from + 1)) {
      const before = from === 0 ? " " : (haystack[from - 1] ?? " ");
      const after = haystack[from + token.length] ?? " ";
      if (/\s/.test(before) && /\s/.test(after)) return true;
    }
  }
  return false;
}
```

`MENTION_TRIGGERS` is the one list both the picker and this scan read, declared
beside `MENTION_QUERY_RE`:

```ts
/** Every live trigger char, in hint order. The single source of truth for what
 *  counts as a trigger — `MENTION_QUERY_RE`/`MENTION_RE` encode the same set as
 *  a character class, and `hasMentionFor` iterates this. */
const MENTION_TRIGGERS = ["@", "/", "#"] as const;
```

- [ ] **Step 5: Gate the trigger and split the result sources**

Add the runaway-cap constant next to the other mention constants:

```ts
/** Runaway guard on one picker's row count — `MenuSurface`'s own `scroll` +
 *  `maxHeight` is what keeps the panel inside the viewport. */
const MENTION_MAX_ROWS = 50;
```

Inside the component, just above `syncMention`, add the gate:

```ts
  /** Whether a trigger is live on THIS host. `@` always is (routing is what the
   *  composer is for); `#` is opt-in via `allowTeamMentions`. A disabled trigger
   *  opens no picker at all — never an empty one, which would advertise a source
   *  the host can't honor (see `allowTeamMentions`'s docblock). */
  function triggerEnabled(trigger: MentionTrigger): boolean {
    return trigger === "#" ? allowTeamMentions : trigger === "@";
  }
```

and make `syncMention` respect it:

```ts
  function syncMention(el: HTMLTextAreaElement) {
    const caret = el.selectionStart ?? el.value.length;
    const found = checkMention(el.value, caret);
    const next = found && triggerEnabled(found.trigger) ? found : null;
    setMention(next);
    setMentionIndex(0);
    setCaretRect(next ? measureCaretRect(el) : null);
  }
```

Replace the `mentionResults` memo (:815-864) with a per-trigger switch:

```ts
  const mentionResults = useMemo<MentionResult[]>(() => {
    if (!mention) return [];

    // `#` — the KB-scope trigger. A team resolves to a scope tag, never a
    // `TaskTarget` (see `pickMentionResult`'s branch); `"brain"` is the app's
    // existing knowledge/memory glyph.
    if (mention.trigger === "#") {
      if (!allowTeamMentions) return [];
      return teams
        .filter((tm) => matchesQuery(mention.query, tm.name, tm.id))
        .map((tm) => ({
          kind: "team" as const,
          id: tm.id,
          name: tm.name,
          glyph: "brain" as IconName,
        }))
        .slice(0, MENTION_MAX_ROWS);
    }

    // `@` — the routing trigger: the three kinds that produce a `TaskTarget`.
    const agentHits: MentionResult[] = agents
      .filter((a) => matchesQuery(mention.query, a.name ?? a.id, a.id))
      .map((a) => ({
        kind: "agent" as const,
        id: a.id,
        name: a.name ?? a.id,
        glyph: (a.glyph as IconName | undefined) ?? "bot",
      }));
    const pipelineHits: MentionResult[] = pipelines
      .filter((p) => matchesQuery(mention.query, p.name, p.id))
      .map((p) => ({
        kind: "pipeline" as const,
        id: p.id,
        name: p.name,
        glyph: "flow" as IconName,
      }));
    const subsystemHits: MentionResult[] = rosterSubsystems
      .filter((s) => matchesQuery(mention.query, s.name, s.id))
      .map((s) => ({
        kind: "subsystem" as const,
        id: s.id,
        name: s.name,
        glyph: "grid" as IconName,
        color: s.color,
      }));
    return [...agentHits, ...pipelineHits, ...subsystemHits].slice(0, MENTION_MAX_ROWS);
  }, [mention, agents, pipelines, rosterSubsystems, teams, allowTeamMentions]);
```

- [ ] **Step 6: Insert the picked row under its own trigger char**

In `pickMentionResult` (:709-714), replace the inserted-text line so it reuses the open trigger rather than hard-coding `@`:

```ts
    const mentionText = `${mention.trigger}${result.name} `;
```

and in the portaled row's trailing mono label (:1126-1128) show the same char:

```ts
                          <Typography mono size="xs" type="note" variant="tertiary">
                            {`${mention.trigger}${result.name}`}
                          </Typography>
```

(The portal only renders while `mention` is non-null, so `mention.trigger` is safe there — it is already inside the `{mention && …}` guard at :1050.)

- [ ] **Step 7: Update the `allowTeamMentions` docblock to describe the `#` trigger**

Replace the prop's docblock (:116-129) — the rule it states is unchanged, only the trigger it gates:

```ts
  /**
   * TODO 9: whether the `#` trigger — the team/KB-scope picker — is live at all.
   * Default **`false`**, opt-IN, and a disabled trigger opens no picker at all
   * rather than an empty one. Offering it only does something real on the chat
   * path (`ChatDock`, which passes `true` explicitly): a tagged team there
   * genuinely narrows the KB end-to-end via `onTeamChange`. Every task path —
   * `TaskCommandLine`, and the automations composers (`AutomationFormDialog`, the
   * `DetailScreen` task-edit surface) — passes `false` explicitly rather than
   * relying on the default, per the rule this prop exists for: a team tagged on a
   * task doesn't reach a run yet (needs new fields on
   * `PipelineRunSchema`/`GoalRunSchema`/`ScheduledTaskSchema` — see
   * `docs/api/teams.md`), so offering the trigger there would promise a scope
   * that silently does nothing. The default is opt-in (not opt-out) precisely so
   * a FUTURE caller that forgets this prop is safe by default — every call site's
   * intent must be explicit.
   */
  allowTeamMentions?: boolean;
```

Also update `onTeamChange`'s docblock (:107-114) and `MentionResult`'s (:200-206) to say `#`-mention where they say `@`-mention for a team.

- [ ] **Step 8: Run the tests to verify they pass**

Run: `pnpm exec vitest run apps/web/features/tasks/components/CommandLine/CommandLine.test.tsx --project web`
Expected: PASS — the new block plus every pre-existing test in the file.

- [ ] **Step 9: Run the sibling suites that render this component**

Run: `pnpm exec vitest run apps/web/features/tasks/components/CommandLine/TaskCommandLine.test.tsx apps/web/features/automations apps/web/features/chat/components/ChatDock.test.tsx --project web`
Expected: PASS. `ChatDock.test.tsx`'s "Task 8 fix round 1" block (:186-233) types `@DevRel` and asserts the resulting `text` on the mutation body — every one of those `@DevRel` occurrences becomes `#DevRel`, in the typed input AND in the expected `text` (`"#DevRel co víme o partner portálu?"`). That is the mandated behavior change; never delete an assertion to make the suite green.

- [ ] **Step 10: Commit**

```bash
pnpm exec prettier --write apps/web/features/tasks/components/CommandLine/CommandLine.tsx apps/web/features/tasks/components/CommandLine/CommandLine.test.tsx apps/web/features/chat/components/ChatDock.test.tsx
pnpm exec eslint --fix apps/web/features/tasks/components/CommandLine/CommandLine.tsx apps/web/features/tasks/components/CommandLine/CommandLine.test.tsx apps/web/features/chat/components/ChatDock.test.tsx
git add apps/web/features/tasks/components/CommandLine/ apps/web/features/chat/components/ChatDock.test.tsx
git commit -m "feat(web): make the composer trigger-generic and move teams to #"
```

---

### Task 4: `CommandLine` — the `/` skills trigger

**Files:**
- Modify: `apps/web/features/tasks/components/CommandLine/CommandLine.tsx` (props, `MentionResult`, imports, `triggerEnabled`, `mentionResults`, `pickMentionResult`, `submit`, `handleChange`, the row `Tag` tone)
- Test: `apps/web/features/tasks/components/CommandLine/CommandLine.test.tsx` (a new describe block + the skills query mock)
- Test (Step 8 — all three are part of THIS task's commit): `apps/web/features/tasks/components/CommandLine/TaskCommandLine.test.tsx`, `apps/web/features/automations/DetailScreen.test.tsx`, `apps/web/features/chat/components/ChatDock.test.tsx` — each gains the skills mock at its own relative depth

**Interfaces:**
- Consumes: Task 3's `MentionTrigger`, `triggerEnabled`, and per-trigger `mentionResults`.
- Produces: props `allowSkillMentions?: boolean` (default `false`) and `onSkillChange?: (skillId: string | undefined) => void`; `MentionResult.kind` gains `"skill"`. Task 6 (`ChatDock`) consumes both.

- [ ] **Step 1: Write the failing tests**

Add the skills mock beside the existing `teams` mock at the top of `CommandLine.test.tsx`:

```ts
// TODO 9: the `/` trigger's source — the ZIBBY skill catalog. Shaped like
// `useSkillsQuery`'s domain `Skill` (name and glyph always present).
vi.mock("../../../skills", () => ({
  useSkillsQuery: () => ({
    data: [
      { id: "code-review", name: "Code Review", glyph: "spark", desc: "", file: "" },
      { id: "brainstorm", name: "Brainstorm", glyph: "spark", desc: "", file: "" },
    ],
  }),
}));
```

and append this describe block:

```ts
  describe("TODO 9 — `/` picks a ZIBBY skill, never a routing target", () => {
    it("lists skills under `/` and filters them live", async () => {
      const user = userEvent.setup();
      render(<CommandLine allowSkillMentions onSubmit={vi.fn()} />);
      const input = screen.getByTestId(CommandLineTestId.Input);

      await user.type(input, "/");
      expect(
        screen.getByTestId(`${CommandLineTestId.MentionItem}-skill-code-review`),
      ).toBeInTheDocument();
      expect(
        screen.getByTestId(`${CommandLineTestId.MentionItem}-skill-brainstorm`),
      ).toBeInTheDocument();

      await user.type(input, "brain");
      expect(
        screen.getByTestId(`${CommandLineTestId.MentionItem}-skill-brainstorm`),
      ).toBeInTheDocument();
      expect(
        screen.queryByTestId(`${CommandLineTestId.MentionItem}-skill-code-review`),
      ).not.toBeInTheDocument();
    });

    it("opens no picker at all on `/` when `allowSkillMentions` is left at its (opt-in) default", async () => {
      const user = userEvent.setup();
      render(<CommandLine onSubmit={vi.fn()} />);
      await user.type(screen.getByTestId(CommandLineTestId.Input), "/");

      expect(screen.queryByTestId(CommandLineTestId.MentionMenu)).not.toBeInTheDocument();
    });

    it("picking a skill inserts the inline /Name and calls onSkillChange — onTargetChange and onTeamChange never fire", async () => {
      const onSkillChange = vi.fn();
      const onTargetChange = vi.fn();
      const onTeamChange = vi.fn();
      const user = userEvent.setup();
      render(
        <CommandLine
          allowSkillMentions
          allowTeamMentions
          onSkillChange={onSkillChange}
          onSubmit={vi.fn()}
          onTargetChange={onTargetChange}
          onTeamChange={onTeamChange}
        />,
      );
      const input = screen.getByTestId(CommandLineTestId.Input);
      await user.type(input, "/Code");
      await user.click(screen.getByTestId(`${CommandLineTestId.MentionItem}-skill-code-review`));

      expect(input).toHaveValue("/Code Review ");
      expect(onSkillChange).toHaveBeenCalledWith("code-review");
      expect(onTargetChange).not.toHaveBeenCalled();
      expect(onTeamChange).not.toHaveBeenCalled();
    });

    it("submits with no target when only a skill was picked", async () => {
      const onSubmit = vi.fn();
      const user = userEvent.setup();
      render(<CommandLine allowSkillMentions onSubmit={onSubmit} />);
      const input = screen.getByTestId(CommandLineTestId.Input);
      await user.type(input, "/Code");
      await user.click(screen.getByTestId(`${CommandLineTestId.MentionItem}-skill-code-review`));
      await user.type(input, "projdi ten diff");
      await user.click(screen.getByTestId(CommandLineTestId.Send));

      expect(onSubmit).toHaveBeenCalledWith("/Code Review projdi ten diff", undefined, undefined);
    });

    it("deleting the /Name out of the text clears the picked skill", async () => {
      const onSkillChange = vi.fn();
      const user = userEvent.setup();
      render(
        <CommandLine allowSkillMentions onSkillChange={onSkillChange} onSubmit={vi.fn()} />,
      );
      const input = screen.getByTestId(CommandLineTestId.Input);
      await user.type(input, "/Code");
      await user.click(screen.getByTestId(`${CommandLineTestId.MentionItem}-skill-code-review`));
      onSkillChange.mockClear();

      await user.clear(input);

      expect(onSkillChange).toHaveBeenCalledWith(undefined);
    });

    it("clears the picked skill after a submit that resets the draft, so it never leaks onto the next turn", async () => {
      const onSkillChange = vi.fn();
      const user = userEvent.setup();
      render(
        <CommandLine allowSkillMentions onSkillChange={onSkillChange} onSubmit={vi.fn()} />,
      );
      const input = screen.getByTestId(CommandLineTestId.Input);
      await user.type(input, "/Code");
      await user.click(screen.getByTestId(`${CommandLineTestId.MentionItem}-skill-code-review`));
      await user.type(input, "projdi to");
      onSkillChange.mockClear();
      await user.click(screen.getByTestId(CommandLineTestId.Send));

      expect(onSkillChange).toHaveBeenLastCalledWith(undefined);
    });

    it("gives the skill row a tone distinct from every other kind in the picker", async () => {
      const user = userEvent.setup();
      render(<CommandLine allowSkillMentions onSubmit={vi.fn()} />);
      await user.type(screen.getByTestId(CommandLineTestId.Input), "/");

      const skillTag = within(
        screen.getByTestId(`${CommandLineTestId.MentionItem}-skill-code-review`),
      ).getByTestId(TagTestId.Root);
      expect(skillTag).toHaveClass("text-run");
      expect(skillTag).not.toHaveClass("text-accent");
      expect(skillTag).not.toHaveClass("text-risk-push");
      expect(skillTag).not.toHaveClass("text-risk-send");
    });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run apps/web/features/tasks/components/CommandLine/CommandLine.test.tsx --project web`
Expected: FAIL — `allowSkillMentions` / `onSkillChange` are not props yet and `/` opens nothing.

- [ ] **Step 3: Add the props and the skill kind**

In `CommandLine.tsx`, add the query import next to the teams one:

```ts
import { useSkillsQuery } from "../../../skills";
```

Add both props to `CommandLineProps`, right after `allowTeamMentions`:

```ts
  /**
   * TODO 9: whether the `/` trigger — the ZIBBY skill picker — is live at all.
   * Default **`false`**, opt-IN, same rule as {@link CommandLineProps.allowTeamMentions}:
   * only `ChatDock` passes `true`, because only the chat send path carries a
   * picked skill to a real turn (`SendChatMessageBodySchema.skillId` →
   * `ChatSessionService`'s `--append-system-prompt`). A task path has no such
   * field, so offering the trigger there would promise a behavior that silently
   * does nothing.
   */
  allowSkillMentions?: boolean;
  /**
   * TODO 9: mirrors the picked `/`-mention SKILL id (or its clearing) up to the
   * parent. A third independent axis beside {@link CommandLineProps.onTargetChange}
   * (WHO runs it) and {@link CommandLineProps.onTeamChange} (WHAT it may read):
   * picking a skill touches neither, and a draft may carry any combination.
   */
  onSkillChange?: (skillId: string | undefined) => void;
```

Destructure them in the parameter list beside the existing ones:

```ts
  allowTeamMentions = false,
  allowSkillMentions = false,
  onSkillChange,
```

Widen `MentionResult`:

```ts
  kind: "agent" | "pipeline" | "subsystem" | "team" | "skill";
```

Add the state beside `team`:

```ts
  // TODO 9: the picked `/`-mention SKILL — independent of both `target` and
  // `team` (see `onSkillChange`'s docblock). Keeps the name alongside the id so
  // the same "still referenced in the text" reconciliation applies.
  const [skill, setSkill] = useState<{ id: string; name: string } | undefined>(undefined);
```

and the query beside the others:

```ts
  const { data: skills = [] } = useSkillsQuery();
```

- [ ] **Step 4: Make `/` a live trigger with the skills source**

Extend `triggerEnabled`:

```ts
  function triggerEnabled(trigger: MentionTrigger): boolean {
    if (trigger === "@") return true;
    if (trigger === "/") return allowSkillMentions;
    return allowTeamMentions;
  }
```

Add the `/` branch at the top of `mentionResults`, before the `#` one, and extend the memo's deps:

```ts
    // `/` — the skill trigger. A skill resolves to neither a `TaskTarget` nor a KB
    // scope: it decides WHICH instructions the turn follows.
    if (mention.trigger === "/") {
      if (!allowSkillMentions) return [];
      return skills
        .filter((s) => matchesQuery(mention.query, s.name, s.id))
        .map((s) => ({
          kind: "skill" as const,
          id: s.id,
          name: s.name,
          glyph: s.glyph,
        }))
        .slice(0, MENTION_MAX_ROWS);
    }
```

```ts
  }, [
    mention,
    agents,
    pipelines,
    rosterSubsystems,
    teams,
    allowTeamMentions,
    skills,
    allowSkillMentions,
  ]);
```

- [ ] **Step 5: Resolve, reconcile and reset the picked skill**

In `pickMentionResult`, add the branch before the `TaskTarget` `else`:

```ts
    if (result.kind === "team") {
      setTeam({ id: result.id, name: result.name });
      onTeamChange?.(result.id);
    } else if (result.kind === "skill") {
      // TODO 9: like a team, a skill is NOT a routing destination — this branches
      // before any `TaskTarget` is built so a skill pick never touches
      // `target`/`onTargetChange`.
      setSkill({ id: result.id, name: result.name });
      onSkillChange?.(result.id);
    } else {
```

In `handleChange`, add the third reconciliation beside the team one:

```ts
    // TODO 9: the picked skill reconciles the SAME way — its `/Name` deleted out
    // of the text clears it, independent of `target` and `team`.
    if (skill && !hasMentionFor(nextValue, skill.name)) {
      setSkill(undefined);
      onSkillChange?.(undefined);
    }
```

In `submit`'s `resetOnSubmit` block, add the clearing beside the team one:

```ts
      if (skill) {
        setSkill(undefined);
        onSkillChange?.(undefined);
      }
```

- [ ] **Step 6: Give the skill row its own tone**

In the portaled row's `Tag`, extend the tone ladder (the subsystem kind still renders its own colored-dot row above and never reaches here):

```ts
                              tone={
                                result.kind === "agent"
                                  ? "accent"
                                  : result.kind === "pipeline"
                                    ? "push"
                                    : result.kind === "skill"
                                      ? // TODO 9: `"run"` — an existing `TagTone`
                                        // unused elsewhere in this dropdown, and the
                                        // one whose meaning ("running") matches what
                                        // `/` does. Keeps every kind visually distinct.
                                        "run"
                                      : "send"
                              }
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `pnpm exec vitest run apps/web/features/tasks/components/CommandLine/CommandLine.test.tsx --project web`
Expected: PASS.

- [ ] **Step 8: Run the sibling suites**

`CommandLine` now calls `useSkillsQuery()` unconditionally, so add the Step 1
skills mock (same fixture, path adjusted to that file's depth) to the three other
suites that already mock the composer's catalogs — they are exactly the files
already mocking the composer's catalogs. (`apps/web/features/automations/Screen.test.tsx` also renders `CommandLine` through `AutomationFormDialog` but mocks none of them — an unmocked query just yields `data = []`, so it needs no change.)

- `apps/web/features/tasks/components/CommandLine/TaskCommandLine.test.tsx` → `vi.mock("../../../skills", …)`
- `apps/web/features/automations/DetailScreen.test.tsx` → `vi.mock("../skills", …)` (one level — its existing siblings are `vi.mock("../teams", …)` at :93 and `vi.mock("../agents/queries", …)` at :66; `"../../skills"` would resolve to the non-existent `apps/web/skills` and fail to load)
- `apps/web/features/chat/components/ChatDock.test.tsx` → `vi.mock("../../skills", …)`

Run: `pnpm exec vitest run apps/web/features/tasks/components/CommandLine/TaskCommandLine.test.tsx apps/web/features/automations apps/web/features/chat --project web`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
pnpm exec prettier --write apps/web/features/tasks/components/CommandLine/CommandLine.tsx apps/web/features/tasks/components/CommandLine/CommandLine.test.tsx apps/web/features/tasks/components/CommandLine/TaskCommandLine.test.tsx apps/web/features/automations/DetailScreen.test.tsx apps/web/features/chat/components/ChatDock.test.tsx
pnpm exec eslint --fix apps/web/features/tasks/components/CommandLine/CommandLine.tsx apps/web/features/tasks/components/CommandLine/CommandLine.test.tsx apps/web/features/tasks/components/CommandLine/TaskCommandLine.test.tsx apps/web/features/automations/DetailScreen.test.tsx apps/web/features/chat/components/ChatDock.test.tsx
git add apps/web/features/tasks/components/CommandLine/ apps/web/features/automations/DetailScreen.test.tsx apps/web/features/chat/components/ChatDock.test.tsx
git commit -m "feat(web): add the / skill trigger to the composer"
```

---

### Task 5: Per-host trigger hint + explicit opt-outs at every task call site

**Files:**
- Modify: `apps/web/i18n/messages/cs.json`, `apps/web/i18n/messages/en.json` (`tasks.commandLine.chrome.*`, `chat.mention.ariaLabel`, `chat.mention.placeholder`)
- Modify: `apps/web/features/tasks/components/CommandLine/CommandLine.tsx` (the `Panel` `headerEnd`, :1170-1180)
- Modify: `apps/web/features/tasks/components/CommandLine/TaskCommandLine.tsx:324`
- Modify: `apps/web/features/automations/components/AutomationFormDialog.tsx:88-94`
- Modify: `apps/web/features/automations/DetailScreen.tsx:169-175`
- Test: `apps/web/features/tasks/components/CommandLine/CommandLine.test.tsx` (the chrome-hint tests around :485-505)

**Interfaces:**
- Consumes: `allowSkillMentions` / `allowTeamMentions` from Tasks 3-4.
- Produces: i18n keys `tasks.commandLine.chrome.triggerAgents`, `.triggerSkills`, `.triggerTeams`, `.hintAttach`; the keys `tasks.commandLine.chrome.hint` and `.hintNoTeams` are DELETED (only `CommandLine.tsx` and its test read them).

- [ ] **Step 1: Write the failing hint tests**

Replace the two existing chrome-hint assertions — the ones inside `it("wraps the input in the panel chrome by default (header icon + label + hint)")` at :486-496 and the whole `it("the chrome hint includes teams once `allowTeamMentions` is explicitly on — Fix round 2")` at :498-501 — with the block below. The panel header (`PanelTestId.Header`, the only Panel test id that wraps the `headerEnd` slot — the enum has just `Root`/`Header`/`Body`) is what carries the hint text:

```ts
    it("wraps the input in the panel chrome by default (header icon + label + hint)", () => {
      render(<CommandLine onSubmit={vi.fn()} />);
      expect(screen.getByTestId(PanelTestId.Header)).toHaveTextContent("Zadej směr");
      // TODO 9: the hint names exactly the triggers THIS render offers — with both
      // opt-in props left at their default, only `@` is live.
      const hint = screen.getByTestId(PanelTestId.Header).textContent ?? "";
      expect(hint).toContain("@ hledá agenty, pipeliny a podsystémy");
      expect(hint).not.toContain("/ pustí skill");
      expect(hint).not.toContain("# hledá týmy");
    });

    it("names `/` and `#` once both triggers are explicitly on", () => {
      render(<CommandLine allowSkillMentions allowTeamMentions onSubmit={vi.fn()} />);
      const hint = screen.getByTestId(PanelTestId.Header).textContent ?? "";

      expect(hint).toContain("@ hledá agenty, pipeliny a podsystémy");
      expect(hint).toContain("/ pustí skill");
      expect(hint).toContain("# hledá týmy");
    });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run apps/web/features/tasks/components/CommandLine/CommandLine.test.tsx --project web`
Expected: FAIL — today's single-string hint always names teams-or-not and never `/`.

- [ ] **Step 3: Replace the hint keys in both catalogs**

In `apps/web/i18n/messages/cs.json`, under `tasks.commandLine.chrome`, delete `hint` and `hintNoTeams` and add:

```json
        "triggerAgents": "@ hledá agenty, pipeliny a podsystémy",
        "triggerSkills": "/ pustí skill",
        "triggerTeams": "# hledá týmy",
        "hintAttach": "přetáhni soubor, nebo použij sponku"
```

In `apps/web/i18n/messages/en.json`, the same shape:

```json
        "triggerAgents": "@ searches agents, pipelines and subsystems",
        "triggerSkills": "/ runs a skill",
        "triggerTeams": "# searches teams",
        "hintAttach": "drag a file, or use the paperclip"
```

Also retune the picker's accessible name, which still says "agent or pipeline". It
must stay trigger-AGNOSTIC: `CommandLine` reads it through `tMention` on every host
(:428, :1055), including the ones where `/` and `#` are off — a screen-reader label
naming a trigger the host doesn't offer breaks R5 exactly the way the visible hint
would. `cs`:

```json
      "ariaLabel": "Vyhledávání k oslovení",
```

and `en`:

```json
      "ariaLabel": "Search to mention",
```

Leave `chat.mention.placeholder` alone — `tMention` only ever resolves `ariaLabel`
and `empty`, so it is a dead key; retuning it would be churn with no effect.

- [ ] **Step 4: Compose the hint from the live triggers**

In `CommandLine.tsx`, replace the `headerEnd` `Typography`'s body:

```tsx
          headerEnd={
            <Typography mono size="2xs" type="note" variant="tertiary">
              {/* TODO 9: the hint must name exactly the triggers this render
                  offers and nothing else — see `allowTeamMentions`'s docblock. */}
              {[
                t("commandLine.chrome.triggerAgents"),
                ...(allowSkillMentions ? [t("commandLine.chrome.triggerSkills")] : []),
                ...(allowTeamMentions ? [t("commandLine.chrome.triggerTeams")] : []),
                ...(showAttach ? [t("commandLine.chrome.hintAttach")] : []),
              ].join(" · ")}
            </Typography>
          }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm exec vitest run apps/web/features/tasks/components/CommandLine/CommandLine.test.tsx --project web`
Expected: PASS.

- [ ] **Step 6: State the opt-out explicitly at every task call site**

`apps/web/features/tasks/components/CommandLine/TaskCommandLine.tsx:324` — add the second flag next to the existing one:

```tsx
        allowSkillMentions={false}
        allowTeamMentions={false}
```

`apps/web/features/automations/components/AutomationFormDialog.tsx` — replace the comment + prop at :88-94:

```tsx
        {/* Explicit `false` on both: this dialog always creates a `type: "task"`
            target, and neither a team's KB scope nor a picked skill reaches a task
            run yet (see CommandLine's `allowTeamMentions` / `allowSkillMentions`
            docblocks). Matches the (opt-in) default; stated explicitly so the
            intent survives a future default change. */}
        <CommandLine
          showAttach
          allowSkillMentions={false}
          allowTeamMentions={false}
```

`apps/web/features/automations/DetailScreen.tsx` — the same two lines and comment at :169-175:

```tsx
                  {/* Explicit `false` on both: this edit surface is a `type: "task"`
                      target, and neither a team's KB scope nor a picked skill reaches
                      a task run yet (see CommandLine's `allowTeamMentions` /
                      `allowSkillMentions` docblocks). Matches the (opt-in) default;
                      stated explicitly so the intent survives a future default change. */}
                  <CommandLine
                    showAttach
                    allowSkillMentions={false}
                    allowTeamMentions={false}
```

- [ ] **Step 7: Run the touched suites**

Run: `pnpm exec vitest run apps/web/features/tasks apps/web/features/automations --project web`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
pnpm exec prettier --write apps/web/i18n/messages/cs.json apps/web/i18n/messages/en.json apps/web/features/tasks/components/CommandLine/CommandLine.tsx apps/web/features/tasks/components/CommandLine/CommandLine.test.tsx apps/web/features/tasks/components/CommandLine/TaskCommandLine.tsx apps/web/features/automations/components/AutomationFormDialog.tsx apps/web/features/automations/DetailScreen.tsx
pnpm exec eslint --fix apps/web/features/tasks/components/CommandLine/CommandLine.tsx apps/web/features/tasks/components/CommandLine/TaskCommandLine.tsx apps/web/features/automations/components/AutomationFormDialog.tsx apps/web/features/automations/DetailScreen.tsx
git add apps/web/i18n/messages/ apps/web/features/tasks/ apps/web/features/automations/
git commit -m "feat(web): describe only the triggers a host offers"
```

---

### Task 6: `ChatDock` — carry the picked skill to the API

**Files:**
- Modify: `apps/web/features/chat/components/ChatDock.tsx` (`:139` team state, `:154-170` `send`, `:307-340` the `CommandLine` props)
- Modify: `apps/web/i18n/messages/cs.json`, `apps/web/i18n/messages/en.json` (`chat.composer.sendError`)
- Test: `apps/web/features/chat/components/ChatDock.test.tsx`

**Interfaces:**
- Consumes: `SendChatMessageBodySchema.skillId` (Task 1), `allowSkillMentions` + `onSkillChange` (Task 4).
- Produces: nothing downstream — this is the last task.

- [ ] **Step 1: Write the failing tests**

The file's fixtures are `sendMutate` (the mutation spy, :37) and
`renderWithProviders(<ChatDockHarness />)` (the harness component defined in the
file) — the block below uses both verbatim; do not invent new ones. Add it as a
nested describe beside the existing `describe("Task 8 fix round 1 — a tagged team
reaches the send mutation body", …)` (grep for that string; it is around :184).
The Step-8-of-Task-4 skills mock (`vi.mock("../../skills", …)`) must already be in
this file. Wrap all of the tests below — including Step 5's — in this one wrapper,
which is the "same new describe" the later steps refer to:

```ts
  describe("TODO 9 — a `/`-picked skill reaches the send mutation body", () => {
    // … the `it(...)` blocks below, plus Step 5's error test, go here …
  });
```

```ts
    it("sends the `/`-picked skill as body.skillId", async () => {
      const user = userEvent.setup();
      renderWithProviders(<ChatDockHarness />);
      const input = screen.getByTestId(CommandLineTestId.Input);
      await user.type(input, "/Code");
      await user.click(screen.getByTestId(`${CommandLineTestId.MentionItem}-skill-code-review`));
      await user.type(input, "projdi to");
      await user.click(screen.getByTestId(ChatDockTestId.Send));

      expect(sendMutate).toHaveBeenCalledWith({
        body: {
          conversationId: "c1",
          text: "/Code Review projdi to",
          skillId: "code-review",
        },
      });
    });

    it('omits skillId entirely — not "", not null — when no skill is picked', async () => {
      const user = userEvent.setup();
      renderWithProviders(<ChatDockHarness />);
      await user.type(screen.getByTestId(CommandLineTestId.Input), "ahoj");
      await user.click(screen.getByTestId(ChatDockTestId.Send));

      // The cast mirrors the file's existing style (:211, :231) — `noUncheckedIndexedAccess`
      // makes the indexed read optional, and asserting through a typed local keeps a
      // never-called mock a clear failure rather than a confusing `undefined` read.
      const call = sendMutate.mock.calls[0]?.[0] as { body: Record<string, unknown> };
      expect(call.body).not.toHaveProperty("skillId");
    });

    it("does not leak a picked skill onto the next turn", async () => {
      const user = userEvent.setup();
      renderWithProviders(<ChatDockHarness />);
      const input = screen.getByTestId(CommandLineTestId.Input);
      await user.type(input, "/Code");
      await user.click(screen.getByTestId(`${CommandLineTestId.MentionItem}-skill-code-review`));
      await user.type(input, "první tah");
      await user.click(screen.getByTestId(ChatDockTestId.Send));

      await user.type(screen.getByTestId(CommandLineTestId.Input), "druhý tah");
      await user.click(screen.getByTestId(ChatDockTestId.Send));

      const secondCall = sendMutate.mock.calls[1]?.[0] as { body: Record<string, unknown> };
      expect(secondCall.body).not.toHaveProperty("skillId");
    });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run apps/web/features/chat/components/ChatDock.test.tsx --project web`
Expected: FAIL — no `/` picker is offered in the dock and `skillId` never reaches the body.

- [ ] **Step 3: Hold the picked skill and put it on the body**

In `apps/web/features/chat/components/ChatDock.tsx`, add the state next to `teamId` (:139):

```ts
  // TODO 9: the `/`-picked skill for the NEXT turn, mirrored from `CommandLine`'s
  // `onSkillChange` exactly the way `teamId` is (a skill is not part of
  // `onSubmit`'s signature either). Cleared by `CommandLine` itself right after
  // `onSubmit` fires, under the default `resetOnSubmit` — which is why a skill
  // picked for one turn doesn't leak onto the next.
  const [skillId, setSkillId] = useState<string | undefined>(undefined);
```

and extend `send` (:154-170):

```ts
      sendMessage.mutate({
        body: {
          conversationId,
          text,
          ...(target ? { target } : {}),
          ...(teamId ? { teamId } : {}),
          ...(skillId ? { skillId } : {}),
        },
      });
    },
    [conversationId, setMessages, sendMessage, teamId, skillId],
  );
```

- [ ] **Step 4: Turn the trigger on in the dock's composer**

Add both props to the `CommandLine` element (:307-315), keeping the alphabetical prop order the file already uses:

```tsx
            <CommandLine
              allowSkillMentions
              allowTeamMentions
              frameless
              hideLabel
              showAttach
```

and the callback beside `onTeamChange` (:328):

```tsx
              onSkillChange={setSkillId}
              onTeamChange={setTeamId}
```

- [ ] **Step 5: Surface a rejected send instead of swallowing it**

The API answers a `skillId` with no skill file behind it with a 404 (Task 2), and
the optimistic user turn is already in the transcript by then. Surface it from the
mutation's own error state rather than by passing `onError` as a second argument to
`sendMessage.mutate(...)` — every existing test asserts
`expect(sendMutate).toHaveBeenCalledWith({ body: … })`, a single-argument shape a
second argument would break across the whole file.

Add, after the `thinking` derivation (`ChatDock.tsx:143`) and after `appendError`
is declared (:109, so it is already in scope):

```ts
  // TODO 9: a rejected turn (e.g. a 404 for a skill deleted between the catalog
  // read and the send) must be visible — the optimistic user message is already in
  // the transcript. Read off the mutation's own error state so `mutate` keeps its
  // single-argument call shape.
  useEffect(() => {
    if (sendMessage.error) appendError(t("composer.sendError"));
    // `appendError` is a stable `useCallback([setMessages])` and next-intl memoizes
    // `t` — both matter here: an unstable dep would re-append on every render for as
    // long as `error` stays truthy.
  }, [sendMessage.error, appendError, t]);
```

Add the key to both catalogs under `chat.composer` — `cs`:

```json
      "sendError": "Zprávu se nepodařilo odeslat."
```

`en`:

```json
      "sendError": "The message couldn't be sent."
```

Extend the mutation mock (`ChatDock.test.tsx:37-41`) with the error field the effect
reads, defaulting to none so no existing test changes behaviour:

```ts
const sendMutate = vi.fn();
const sendState = { isPending: false, error: null as Error | null };
vi.mock("../mutations/useSendChatMessageMutation", () => ({
  useSendChatMessageMutation: () => ({
    mutate: sendMutate,
    isPending: sendState.isPending,
    error: sendState.error,
  }),
}));
```

and cover it with one test in the same new describe. The reset goes in an
`afterEach`, not the test body — `sendState` is module-level and shared, so a
failing assertion would otherwise leak the error into every later test in the file:

```ts
    afterEach(() => {
      sendState.error = null;
    });

    it("surfaces a rejected send in the transcript instead of swallowing it", async () => {
      sendState.error = new Error("404");
      renderWithProviders(<ChatDockHarness />);

      // One plain sentence: the assistant branch renders through `MarkdownProse`
      // (`ChatMessage.tsx:182`), so the copy must stay free of markdown-significant
      // characters for this text match to hold.
      expect(await screen.findByText("Zprávu se nepodařilo odeslat.")).toBeInTheDocument();
    });
```

Add `afterEach` to the file's `vitest` import if it isn't already there.

If `useEffect` is not yet imported in `ChatDock.tsx`, it is — the file already
imports it at :4.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm exec vitest run apps/web/features/chat --project web`
Expected: PASS — the new cases plus every pre-existing `ChatDock` test.

- [ ] **Step 7: Full verification before handing off**

Run, in order, and fix anything red before continuing:

```bash
pnpm check:types
pnpm check:lint
pnpm test
```

Expected: all green. This is the pre-handoff tier (per `docs/ops/validation-policy.md`), which is why it runs once here rather than after every task.

- [ ] **Step 8: Commit**

```bash
pnpm exec prettier --write apps/web/features/chat/components/ChatDock.tsx apps/web/features/chat/components/ChatDock.test.tsx apps/web/i18n/messages/cs.json apps/web/i18n/messages/en.json
pnpm exec eslint --fix apps/web/features/chat/components/ChatDock.tsx apps/web/features/chat/components/ChatDock.test.tsx
git add apps/web/features/chat/ apps/web/i18n/messages/
git commit -m "feat(web): send the chat composer's picked skill to the API"
```
