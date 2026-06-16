# State Audit — Co skutečně existuje (2026-06-16)

Předchozí roadmap považoval kanály, briefing a budget za neexistující. To není pravda.
Skutečný stav, ověřený vůči `apps/api/src`:

| Capability | Status | Reality on disk |
| --- | --- | --- |
| Delivery loop (agent → review → test → verify, retry/escalate) | ✅ Real | `goals/`, `pipelines/`, `runner/` — bounded iteration, worktree isolation |
| Goals / loop engine (maker ⇄ verifier, parking, budget fuse) | ✅ Real | `goals/goal-runner.service.ts`, per-goal run-count budget |
| Self-development (builder ≠ subject, worktree off-tree) | ✅ Real | sibling-checkout isolation, scoped verifier, `ZIBBY_WORKTREE_ROOT` |
| TaskClassifier (LLM router + keyword fallback + orchestrator floor) | ✅ Real | `tasks/task-classifier.service.ts` |
| Gate engine (locked floor, agent harden-only, dry-run evaluate) | ✅ Real | `gates/`, `data/POLICY.md`; floor: payment/push/pr.open→ask, pr.merge→deny |
| **Channel runtime (Slack + email)** | ✅ **Real, not greenfield** | `channels/` — Slack Web API fetch + email imapflow/nodemailer, 30s cursor-safe poll, approval-gated outbound |
| Memory vault + grounding + run recorder | ✅ Real | `memory/` — index-first read, daily append, term-matched grounding, episodic record |
| Briefing (assemble + butler prose + 07:00 cron) | ✅ Real, **thin** | `briefing/` + `automations/morning-briefing.json` (fires daily) — sections exist, content is shallow |
| Budget governance (per-project + global + concurrency) | 🟡 Partial | `budget/` — run-count caps real; **USD cost tracking absent** (`budget.json`/ledger empty) |
| Mandate / autonomy doc | 🟡 Partial | `data/mandate.json` exists but minimal (`dispatch:true, reply:false`) |
| **Project = operational profile** | ❌ Gap | project je registry (id/name/path/checks/budget/env) — **chybí people, autonomy_policy, daily_rhythm, channel binding** |
| **Inbound message → action routing** | ❌ Gap | runtime ingests + triages, ale chybí classifier→{respond\|create_task\|ignore}→tier wiring per project |
| **Self-learning from approval signals** | ❌ Absent | žádný pattern extractor; složka `patterns/` v vault neexistuje |
| **Nightly consolidation job** | ❌ Absent | heartbeat scheduler existuje, ale chybí nightly roll-up / cost / pattern pass |
| **Standup cheat sheets per project** | ❌ Absent | pouze generické daily briefings |
| **Research / intelligence layer** | ❌ Absent | žádný ResearchAgent nebo watchers |
| **GapDetector / "I want X" NL self-mod flow** | ❌ Absent | self-dev pipeline existuje, proaktivní front-end ne |

**Klíčová korekce:** tvrdá infrastruktura (channel I/O, gate floor, goal loop, vault, budget caps) je již reálná. Mezery jsou převážně **wiring a semantic/learning vrstva** — přeměna existujících pipe na per-project autonomní chování a paměť, která se kumuluje.

## Dependency graph milníků

```
M1 Project Profile ──┬─→ M2 Inbound Autonomy ──→ M3 Narrative Briefing + Standup
                     │                                      │
                     └─→ M7 Multi-Project + USD Budget       └─→ M4 Self-Learning + Nightly Consolidation
                                                                        │
M5 Self-Modification Front-End ─────────────────────────────────────────┤
M6 Research / Intelligence Layer ───────────────────────────────────────┘
M8 Hardening + Telemetry  (continuous, not last)
```
