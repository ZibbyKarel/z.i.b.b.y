/**
 * Maps each `apps/api/src/<module>` directory to the doc file that owns it.
 * `null` means the module is intentionally undocumented as its own concept
 * (cross-cutting infra, not a feature) — everything else must resolve to a
 * real path under docs/.
 *
 * This is the enforcement layer for check.mjs's `--scope=staged` mode (git
 * pre-commit): a module directory with no entry here, or whose mapped doc
 * file doesn't exist on disk, blocks the commit. Adding a brand-new
 * apps/api/src/<x> module means adding a row here (and creating the doc, or
 * folding it into an existing one) in the same commit.
 */
export const API_MODULE_DOC_MAP = {
  "activity-view": "docs/api/activity.md",
  activity: "docs/api/activity.md",
  "agent-factory": "docs/api/agent-factory.md",
  agents: "docs/api/agents-runs.md",
  approvals: "docs/api/approvals.md",
  artifacts: "docs/api/artifacts.md",
  automations: "docs/api/automations.md",
  briefing: "docs/api/briefing.md",
  budget: "docs/api/budget.md",
  channels: "docs/api/channels.md",
  chat: "docs/api/chat.md",
  commands: "docs/api/extensibility.md",
  companies: "docs/api/companies.md",
  discovery: "docs/api/discovery.md",
  events: "docs/api/events.md",
  gaps: "docs/api/gaps.md",
  "gate-rules": "docs/api/gates.md",
  gates: "docs/api/gates.md",
  goals: "docs/api/goals.md",
  handoff: "docs/api/handoff.md",
  health: "docs/api/health.md",
  herald: "docs/api/subsystems.md",
  hooks: "docs/api/extensibility.md",
  integrations: "docs/api/integrations.md",
  kb: "docs/api/teams.md",
  "limits-resume": "docs/api/limits.md",
  limits: "docs/api/limits.md",
  loom: "docs/api/subsystems.md",
  machine: "docs/api/machine.md",
  maestro: "docs/api/subsystems.md",
  mandate: "docs/api/mandate.md",
  mcp: "docs/api/extensibility.md",
  memory: "docs/api/memory.md",
  monitors: "docs/api/monitors.md",
  patterns: "docs/api/patterns.md",
  pins: "docs/api/pins.md",
  pipelines: "docs/api/pipelines.md",
  projects: "docs/api/projects.md",
  "review-learning": "docs/api/review-learning.md",
  roadmap: "docs/api/roadmap.md",
  runner: "docs/api/runner.md",
  "self-knowledge": "docs/api/self-knowledge.md",
  self: "docs/api/self.md",
  sentinel: "docs/api/subsystems.md",
  // cross-cutting infra (logging, storage base classes, text sanitization,
  // config bootstrapping) — not a feature, no dedicated doc expected.
  shared: null,
  skills: "docs/api/extensibility.md",
  speech: "docs/api/speech.md",
  subsystems: "docs/api/subsystems.md",
  system: "docs/api/system.md",
  tasks: "docs/api/tasks.md",
  teams: "docs/api/teams.md",
  workspace: "docs/api/workspace.md",
};

/**
 * Softer, advisory-only checks: a directory here should be *mentioned* by
 * name somewhere in the target doc's prose. Never blocks a commit (fuzzy —
 * a folder existing doesn't always warrant its own paragraph) — surfaced
 * only as a warning in both `--scope=staged` and `--scope=worktree` modes.
 */
export const MENTION_CHECKS = [
  {
    label: "apps/web/features",
    dirsGlob: "apps/web/features",
    doc: "docs/web/overview.md",
  },
  {
    label: "libs/contracts/src",
    dirsGlob: "libs/contracts/src",
    doc: "docs/libs/contracts.md",
  },
];
