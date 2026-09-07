# TODO item 9 — split chat mentions into three triggers

## The raw backlog item (TODO.md:9-12, verbatim)

```
- [ ] rozdělit v chatu mentions (momentálně mention funguje jen přes "@") nově ale bude
  - "@" označovat agenty
  - "/" pouštět specifické skills zibbyho
  - "#" hledat firmy a týmy
```

Translated: today the composer has exactly one mention trigger, `@`, and it mixes four
different sources into one list. Split it into three distinct triggers, each answering a
different question.

## Decisions made with the operator (2026-09-07) — these are settled, do not re-litigate

1. **`/` dispatches for real.** Picking a skill row must reach the backend — a new field on
   the chat send contract, carried through the API into the run, so the turn actually invokes
   that ZIBBY skill. It is *not* UI-only text insertion.
2. **`#` is teams only — companies are out of scope for this item.** The backlog line says
   "firmy a týmy", but companies have no destination the backend honors today, and the
   `allowTeamMentions` docblock's rule (`apps/web/features/tasks/components/CommandLine/CommandLine.tsx:110-130`)
   forbids offering a mention that "would promise a scope that silently does nothing". So `#`
   searches teams and nothing else. Companies (`libs/contracts/src/companies`, `apps/web/features/companies`)
   are deliberately not wired; a later item can add them once they resolve to a real scope.
3. **`@` keeps agents, pipelines and subsystems** — only teams migrate off it. Assumption
   stated rather than asked, because dropping pipelines/subsystems from `@` would break
   `TaskCommandLine`'s dispatch outright: `pickMentionResult` (CommandLine.tsx:709-750) shows
   those three kinds are the only producers of a `TaskTarget`, which is what an explicit
   dispatch needs. "@ označovat agenty" is read as "@ is the WHO-runs-it trigger", not "@ must
   list literally only agent entities".

## Where the current behavior lives

- `apps/web/features/tasks/components/CommandLine/CommandLine.tsx` — the whole mention engine:
  - `MENTION_QUERY_RE = /@([\w.-]*)$/` (:218) and `checkMention()` (:228) — single hard-coded trigger char.
  - `MentionResult.kind` union `"agent" | "pipeline" | "subsystem" | "team"` (:207-213).
  - `mentionResults` useMemo (:815-864) — merges agents + pipelines + rosterSubsystems + teams
    into one list, capped at 50; teams gated behind `allowTeamMentions`.
  - `pickMentionResult()` (:709-750) — the team branch sets a scope tag (`onTeamChange`), every
    other kind builds a `TaskTarget` (`onTargetChange`).
  - `allowTeamMentions` prop (:110-130) — opt-in gate; call sites: `ChatDock.tsx:313` (`true`),
    `TaskCommandLine.tsx:324` (`false`), `AutomationFormDialog.tsx:90` (`false`),
    automations `DetailScreen.tsx` (`false`).
  - `CommandLineTestId` enum (:38-53) — `MentionMenu` / `MentionItem` / `MentionEmpty`.
  - The chrome hint (:1175-1176) picks between `commandLine.chrome.hint` and
    `commandLine.chrome.hintNoTeams` — both strings *describe the available triggers to the
    operator*, so three triggers means both keys and that conditional change.
- `apps/web/i18n/messages/{cs,en}.json` — `commandLine.chrome.hint*` and any mention-related strings.
- `libs/contracts/src/chat/chat.schema.ts:82-102` — `SendChatMessageBodySchema` with `text`,
  `target` (WHO runs it) and `teamId` (WHAT KB it can see); tests in `chat.schema.test.ts:87-105`.
- `libs/contracts/src/skills/skill.schema.ts` — `SkillIdSchema` (reuses `AgentIdSchema`),
  `SkillSchema` with `instructions`, `requires_approval`, `risk`, `gateRuleIds`.
- `libs/contracts/src/skills/skills.contract.ts` — the skills catalog endpoints the `/` picker
  reads from (the web side needs a skills query hook under `apps/web/features/skills/queries/`
  if one doesn't exist yet).
- `apps/api/src/chat/chat-session.service.ts` — consumes `target`/`teamId` today; this is where
  a picked skill has to actually take effect for the turn.

## Requirements

### R1 — Three triggers, three sources
The composer recognises three trigger characters, each opening the same dropdown UI but over
its own source list:

| Trigger | Source | Answers | Resolves to |
|---|---|---|---|
| `@` | agents, pipelines, subsystems (unchanged set minus teams) | WHO runs it | `TaskTarget` via `onTargetChange` |
| `/` | ZIBBY skills catalog | WHICH skill this turn runs | a skill id carried to the backend (R3) |
| `#` | teams | WHAT knowledge base the turn can see | team scope tag via `onTeamChange` |

Trigger detection must be a single generalised mechanism (a trigger→source lookup), not three
copy-pasted regexes and three parallel `useMemo`s. Only one picker is open at a time — the one
whose trigger char precedes the caret.

### R2 — Teams leave `@`
A team is no longer offered under `@` on any call site. `allowTeamMentions` becomes a gate on
the `#` trigger instead of on a row inside the `@` list: a call site that passes it `false`
must not have `#` do anything at all (no dropdown, no scope tag), for exactly the reason the
existing docblock gives. Keep the prop opt-in (default `false`) and keep every call site's
value explicit. Renaming the prop to match its new meaning is allowed if every call site and
test is updated with it.

### R3 — A picked skill reaches the run
- `SendChatMessageBodySchema` gains an optional skill field (id validated by `SkillIdSchema`,
  not a bare string — mirror how `teamId` uses `TeamIdSchema`, and mirror its
  back-compatibility: absent stays valid). Contract-first: schema + contract test before
  implementation.
- The API honors it: the chat turn actually invokes that skill. Research
  `chat-session.service.ts` and the runner's command builder for the mechanism already used to
  put a skill/agent in front of a `claude -p` turn, and use that existing mechanism rather than
  inventing a second one.
- `ChatDock`'s send path passes the picked skill through.
- An unknown / non-existent skill id must fail loudly (a 4xx or an explicit rejected turn), not
  be silently dropped.

### R4 — Existing behavior preserved
- Task paths (`TaskCommandLine`, `AutomationFormDialog`, automations `DetailScreen`) keep
  working exactly as today for `@`; they get no `#` and no `/` unless the same
  "does it reach a run?" test passes for them — it does not, so they must not offer them.
- Attachments, drag-drop `@filename` insertion, suggestions, the caret-anchored/flipping
  dropdown position, keyboard nav (Arrow/Enter/Escape) and the 50-row runaway cap all keep
  working per trigger.
- The whole existing `CommandLine.test.tsx` / `TaskCommandLine.test.tsx` / `ChatDock.test.tsx`
  suite must be green; tests asserting a team row under `@` are updated to assert it under `#`
  (a behavior change the item mandates), never deleted to make the suite pass.

### R5 — Discoverability
The chrome hint text tells the operator which triggers are available *on that host*, in both
`cs` and `en`. A host with `#` off must not advertise `#`.

### R6 — Conventions
Project conventions are non-negotiable here: DS primitives only (no new Tailwind in
`apps/web`, no inline `style` on a DOM element), `data-testid` selection via the
`CommandLineTestId` enum extended with the new per-trigger parts, no `any`, no `forwardRef`,
one query hook per file under `features/<domain>/queries/`, i18n keys added to both catalogs.

## Out of scope
- Companies under `#` (decision 2).
- Teams or skills reaching a *task* run (needs new fields on
  `PipelineRunSchema`/`GoalRunSchema`/`ScheduledTaskSchema` — see `docs/api/teams.md`).
- Any change to the KB scoping semantics teams already have.
