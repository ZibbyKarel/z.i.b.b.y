# ZibbyCorp — decisions still open ("co musíme rozhodnout")

Every question has a **default**. A night run applies the default, records it in
`PROGRESS.md` under "Defaults applied", and continues. The operator can overturn a default
later; each one is scoped so that doing so is cheap.

**Blocking levels:**

| Level | Meaning |
|---|---|
| 🟥 Confirm before the night run | Reversing it later is expensive. The default is still usable. |
| 🟨 Confirm before Part B | It affects screens, not the DS or the rename. |
| 🟩 Non-blocking | Pure presentation, or additive and trivially reversible. |

| # | Question | Default (night run applies) | Level | Affects |
|---|---|---|---|---|
| O-01 | Default theme: the design is light-first; today the app is dark only. | Light and dark both complete. The **default switches to light in ZB-01** (not before, so Part A does not flip the old screens mid-way). A toggle lives in System → Settings → Appearance. `system` follows the OS. | 🟥 | ZA-01, ZB-01 |
| O-02 | Language: the design copy is English; the app is cs-default next-intl. | Keep i18n. Every new string goes into both `cs.json` and `en.json`. Mono uppercase labels are translated too (the CSS uppercases them). Default locale stays `cs`. | 🟥 | all of B |
| O-03 | Human agent names ("Kevin", "Stuart") and job titles. | Additive optional `displayName` and `title` on `AgentSchema`. The UI shows `displayName ?? name`. Slugs are never renamed. Filling in names is the operator's content, not the night run's. | 🟩 | ZB-03 |
| O-04 | The six agent states (working/thinking/blocked/error/done/idle) have no backend enum. | Derived client-side in one pure function, `deriveAgentState(runs, queued)` in `features/departments/state/`. See the mapping below this table. | 🟩 | ZA-03, B |
| O-05 | Handoff tiers 1/2/3 versus the design's AUTO/ASK. | Chain hops: AUTO = tier 2, ASK = tier 3. Signal rules keep all three tiers. The UI shows 3 options there (SILENT/AUTO/ASK). | 🟥 | ZB-05, ZB-08 |
| O-06 | Per-department budgets and spend. | **Spend by department:** derived. Add an additive `department?` stamp on run records at spawn time, then roll up existing cost data. **Per-department caps:** not built. The Ledger shows "—" with a caption. | 🟨 | ZB-04, ZB-10 |
| O-07 | "Agent SDK credit" pool, a design invention. | Not built, not shown. | 🟩 | ZB-10 |
| O-08 | Warn versus stop thresholds (only "pause" exists). | Additive optional `warnAtRollingPct` / `warnAtWeeklyPct` on `GlobalBudgetSchema`. Crossing one writes an activity notice only. | 🟩 | ZB-10 |
| O-09 | Department "binding" of skills/MCP/hooks/automations (bind toggles in the design). | **Derived, read-only.** A registry item is "bound in" the departments whose agents or pipelines use it. There are no toggles and no new FK. A stored binding is a later arc. | 🟨 | ZB-03, ZB-11 |
| O-10 | "Learned patterns". | The same thing as review-learning rules (`libs/contracts/src/review-learning`). The screen is a re-skin, not a new domain. | 🟩 | ZB-08 |
| O-11 | Live log source. | The existing activity SSE stream. No new endpoint. A client ring buffer of 500 entries. | 🟩 | ZB-07 |
| O-12 | Approval fields: rule / diff / deny reason. | Show what exists (rule id, PR diffstat, payload). A deny reason is an additive optional `reason` on the reject body, stored on the approval. | 🟩 | ZB-08 |
| O-13 | Single-click approve (design) versus HoldButton (phase 31). | Keep HoldButton for `HIGH_RISK_TYPES`; single click for the rest. The rail's quick-approve applies only to non-high-risk types. For high-risk ones it opens the sheet. | 🟥 | ZB-01, ZB-08 |
| O-14 | Homes for features the design lacks. | See `ROUTE-MAP.md` § Orphans. Every orphan has a named home, and nothing is dropped silently. | 🟨 | B |
| O-15 | Department KPIs. | OPEN SUBTASKS · AGENTS · RUNS TODAY · SPEND TODAY. The last is derived (O-06), or "—" when there is no cost data. | 🟩 | ZB-03 |
| O-16 | `Goal.projectId`. | Additive optional field. | 🟩 | ZB-06 |
| O-17 | Project default chain and gate profile. | `Project.defaultChainId?` is additive; New Task pre-selects it. The **gate profile is not built** (the design implies it seeds rules; that is a later arc). | 🟨 | ZB-06 |
| O-18 | Task source. | Additive `source?: "operator" \| "department" \| "chain" \| "channel" \| "automation" \| "handoff"`, stamped at creation by the existing call sites. | 🟩 | ZB-04 |
| O-19 | Agent PAUSE/RESUME and "message the agent in session". | PAUSE = stop the agent's current run (existing endpoint), and the label says STOP RUN. Session messaging is **not built** because no mechanism exists; the composer is omitted. | 🟩 | ZB-03 |
| O-20 | Department direct chat (`org/chat/:id`). | No separate transcript. The COO dock opens pre-scoped with an **explicit department target**, which follows the DNA rule "explicit target overrides the classifier". | 🟨 | ZB-12 |
| O-21 | Header "CEO" and company name. | Additive `SystemConfig.operatorName?` and `companyName?` (defaults: git user name, "ZibbyCorp"). The time zone comes from the browser. | 🟩 | ZB-01 |
| O-22 | Voice: wake word, PTT, "speak replies". | Keep today's voice config (`ttsVoice`, idle-gated mic). Wake word and PTT are not built. The dock's VOICE button wires to the real `useSpeechRecognition`. | 🟩 | ZB-12 |
| O-23 | Chain auto-pick by the COO. | v1 order: explicit pick, then the project default, then none (single department via the classifier). A classifier suggestion is a later arc. | 🟨 | ZB-05 |
| O-24 | Vault folders (MOC/Company/Projects/…) versus the real tiers and shelves. | Use the real model: 3 tiers × department shelves. The design's folder names are not invented. | 🟩 | ZB-09 |
| O-25 | Company budget and project cap shape (the mock is flatter). | Keep the real schema; the UI shows fewer fields. | 🟩 | ZB-06 |
| O-26 | Orb map (WebGL). | Retired and deleted (D-010). | 🟥 | ZB-13 |
| O-27 | Department gates, handoff and artefakty tabs (today's drawer) that the design omits. | Department detail keeps **Handoff** as a read-only IN/OUT tab. **Gates** move to Policy → Gate rules with a department filter; the department page links there. **Artefacts** move to Task detail and Activity → Runs. | 🟨 | ZB-03 |

**O-04 state mapping:**

| State | Derived from |
|---|---|
| working | a `running` run |
| thinking | a task queued or pending for this agent, with no run yet |
| blocked | `awaiting-approval` or `paused-limit` |
| error | `error` or `interrupted` within the last 60 min |
| done | `done` within the last 10 min |
| idle | anything else |

## Questions the night run must NOT answer itself

It stops and parks with a note in `PROGRESS.md` if it reaches any of these:

- Anything that loosens the approval floor, `POLICY.md`, or a Law.
- Running the migration `--apply` on the real `.zibby/data` (D-008).
- Deleting any operator data (agents, vault notes, rules) beyond what D-004 renames.
- A design element that needs a new *external* capability (a new API or service
  integration).
