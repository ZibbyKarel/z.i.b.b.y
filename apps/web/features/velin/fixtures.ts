/**
 * Mock velín data — the files-as-source-of-truth model the dashboard renders.
 *
 * In production these come from API routes that read real files on disk
 * (SKILL.md, *.agent.md, *.pipeline.md, quota endpoints). For now they back the
 * TanStack Query hooks in queries.ts so the UI is fully interactive.
 */
import type {
  ActivityEvent,
  AgentDef,
  AgentSdkCredit,
  Approval,
  BriefingItem,
  ClaudeLimits,
  NavItem,
  Pipeline,
  RunningAgent,
  Skill,
  SystemStatus,
} from "@zibby/design-system"

export const PROJECTS = [
  "media-vault",
  "home-ops",
  "zibby-core",
  "rohlik-list",
  "~/cesta/k/projektu",
] as const

export const NAV_ITEMS: NavItem[] = [
  { id: "overview", label: "Přehled", glyph: "grid" },
  { id: "skills", label: "Skilly", glyph: "spark" },
  { id: "agents", label: "Agenti", glyph: "bot" },
  { id: "pipelines", label: "Orchestrace", glyph: "flow" },
  { id: "integrations", label: "Integrace", glyph: "plug" },
  { id: "automations", label: "Automatizace", glyph: "clock" },
  { id: "memory", label: "Paměť", glyph: "brain" },
  { id: "runs", label: "Běžící agenti", glyph: "pulse", badge: 2 },
]

export const SETTINGS_ITEM: NavItem = {
  id: "settings",
  label: "Nastavení systému",
  glyph: "gear",
}

export const NAV_LABELS: Record<string, string> = Object.fromEntries(
  [...NAV_ITEMS, SETTINGS_ITEM].map((n) => [n.id, n.label]),
)

export const CLAUDE_LIMITS: ClaudeLimits = {
  rolling: { label: "5h rolling", short: "5h", usedPct: 64, resetIn: "2h 11m", tokens: "128k / 200k" },
  weekly: { label: "Týdenní", short: "týden", usedPct: 38, resetIn: "Po 09:00", tokens: "1.9M / 5M" },
}

export const AGENT_SDK: AgentSdkCredit = {
  label: "Agent SDK kredit",
  total: 200,
  used: 72,
  remaining: 128,
  usedPct: 36,
  renew: "1. čer",
  byAgent: [
    ["Kodér", "work", 31],
    ["Architekt", "work", 16],
    ["Tester", "work", 11],
    ["Researcher", "work", 8],
    ["tmdb-renamer", "home", 6],
  ],
  byPipeline: [
    ["Build Feature", "work", 38],
    ["Nightly Research", "work", 19],
    ["Media tidy", "home", 8],
    ["Ad-hoc běhy", "work", 7],
  ],
  byContext: [
    ["work", 57],
    ["home", 15],
  ],
  trend: [4, 6, 9, 7, 12, 8, 14, 11, 9, 13, 16, 12, 10, 15],
}

const FAV_SKILLS_HOME: Skill[] = [
  { id: "rohlik", name: "rohlik", glyph: "cart", desc: "Naplní košík podle seznamu", ctx: "home", file: "~/zibby/skills/rohlik/SKILL.md" },
  { id: "tmdb-renamer", name: "tmdb-renamer", glyph: "film", desc: "Přejmenuje média podle TMDB", ctx: "home", file: "~/zibby/skills/tmdb-renamer/SKILL.md" },
  { id: "holly", name: "holly", glyph: "server", desc: "Ovládá NAS démona Holly", ctx: "home", file: "~/zibby/skills/holly/SKILL.md" },
  { id: "task-spec-writer", name: "task-spec-writer", glyph: "doc", desc: "Sepíše spec z volného zadání", ctx: "home", file: "~/zibby/skills/task-spec-writer/SKILL.md" },
]

const FAV_SKILLS_WORK: Skill[] = [
  { id: "spec-skeleton", name: "spec→skeleton", glyph: "doc", desc: "Spec → kostra PR", ctx: "work", file: "~/zibby/skills/spec-skeleton/SKILL.md" },
  { id: "pr-prereview", name: "pr-prereview", glyph: "check", desc: "Pre-review otevřeného PR", ctx: "work", file: "~/zibby/skills/pr-prereview/SKILL.md" },
  { id: "ci-doctor", name: "ci-doctor", glyph: "shield", desc: "Diagnostikuje padající CI", ctx: "work", file: "~/zibby/skills/ci-doctor/SKILL.md" },
  { id: "standup-gen", name: "standup-gen", glyph: "spark", desc: "Vygeneruje standup z gitu", ctx: "work", file: "~/zibby/skills/standup-gen/SKILL.md" },
]

export const favSkillsFor = (ctx: "home" | "work"): Skill[] =>
  ctx === "work" ? FAV_SKILLS_WORK : FAV_SKILLS_HOME

export const RUNNING_AGENTS: RunningAgent[] = [
  { id: "a1", skill: "tmdb-renamer", ctx: "home", prompt: "Srovnej /media/downloads/seriály", state: "running", pct: 72, started: "3m", project: "media-vault" },
  { id: "a2", skill: "webshare-downloader", ctx: "home", prompt: "Stáhni S02E04–E08", state: "running", pct: 41, started: "8m", project: "media-vault" },
]

export const APPROVALS: Approval[] = [
  { id: "ap1", skill: "rohlik", ctx: "home", action: "Objednat košík", detail: "14 položek · 1 248 Kč · doručení zítra 18–20h", risk: "platba" },
]

export const BRIEFING: BriefingItem[] = [
  { tone: "ok", icon: "branch", title: "Build Feature → hotovo", sub: "branch feat/search-filters čeká na review · $11.20 / $25" },
  { tone: "warn", icon: "pause", title: "Build Feature → zaparkováno po 3 pokusech", sub: "Tester: flaky test v checkout-flow · čeká na ranní review" },
  { tone: "bad", icon: "shield", title: "PR Guard → čeká na souhlas s push", sub: "git push origin feat/api-rate-limit · náhled diffu" },
]

export const SYSTEM: SystemStatus = {
  host: "Mac M5",
  awake: true,
  pipelines: 4,
  skills: 9,
}

export const AGENTS: AgentDef[] = [
  { id: "architect", name: "Architekt", glyph: "compass", role: "Navrhne řešení a rozepíše plán do design.md", model: "opus", thinking: "high", tools: ["read", "web", "write"], ctx: "work", state: "idle", file: "~/zibby/agents/architect.agent.md" },
  { id: "coder", name: "Kodér", glyph: "code", role: "Implementuje podle design.md v izolované branchi", model: "sonnet", thinking: "medium", tools: ["read", "write", "bash", "git"], ctx: "work", state: "pipeline", file: "~/zibby/agents/coder.agent.md" },
  { id: "tester", name: "Tester", glyph: "flask", role: "Spustí testy, vrací report a vrací práci zpět", model: "sonnet", thinking: "medium", tools: ["read", "bash", "git"], ctx: "work", state: "pipeline", file: "~/zibby/agents/tester.agent.md" },
  { id: "doc", name: "Dokumentátor", glyph: "doc", role: "Sepíše README a changelog z výsledné branche", model: "sonnet", thinking: "low", tools: ["read", "write"], ctx: "work", state: "idle", file: "~/zibby/agents/doc.agent.md" },
  { id: "reviewer", name: "Reviewer", glyph: "check", role: "Pre-review diffu před návrhem na push", model: "opus", thinking: "high", tools: ["read", "git"], ctx: "work", state: "idle", file: "~/zibby/agents/reviewer.agent.md" },
  { id: "researcher", name: "Researcher", glyph: "search", role: "Sbírá zdroje a syntetizuje poznámky do vaultu", model: "sonnet", thinking: "medium", tools: ["read", "web", "write"], ctx: "work", state: "idle", file: "~/zibby/agents/researcher.agent.md" },
]

export const PIPELINES: Pipeline[] = [
  {
    id: "build-feature", name: "Build Feature", ctx: "work", budget: 25, lastRun: "dnes 03:12", lastState: "parked",
    desc: "Spec → implementace → testy → docs, se zpětnou smyčkou u Testera.",
    file: "~/zibby/pipelines/build-feature.pipeline.md",
    phases: [
      { agent: "Architekt", consumes: "task.md", produces: "design.md", model: "opus", thinking: "high" },
      { agent: "Kodér", consumes: "design.md", produces: "branch feat/*", model: "sonnet", thinking: "medium" },
      { agent: "Tester", consumes: "branch", produces: "test-report.md", model: "sonnet", thinking: "medium", loop: { to: "Kodér", maxRetries: 3, escalate: true, then: "park_for_review" } },
      { agent: "Dokumentátor", consumes: "branch", produces: "README.md", model: "sonnet", thinking: "low" },
    ],
  },
  {
    id: "nightly-research", name: "Nightly Research", ctx: "work", budget: 15, lastRun: "dnes 02:40", lastState: "done",
    desc: "Researcher nasbírá zdroje, Architekt je zsyntetizuje do poznámky.",
    file: "~/zibby/pipelines/nightly-research.pipeline.md",
    phases: [
      { agent: "Researcher", consumes: "topic.md", produces: "sources.md", model: "sonnet", thinking: "medium" },
      { agent: "Architekt", consumes: "sources.md", produces: "knowledge/*.md", model: "opus", thinking: "high" },
    ],
  },
  {
    id: "pr-guard", name: "PR Guard", ctx: "work", budget: 8, lastRun: "včera 18:02", lastState: "done",
    desc: "Reviewer projde diff a připraví push k tvému schválení.",
    file: "~/zibby/pipelines/pr-guard.pipeline.md",
    phases: [
      { agent: "Reviewer", consumes: "branch", produces: "review.md", model: "opus", thinking: "high" },
    ],
  },
  {
    id: "media-tidy", name: "Media tidy", ctx: "home", budget: 5, lastRun: "včera 23:10", lastState: "done",
    desc: "Stáhne a srovná média na Holly.",
    file: "~/zibby/pipelines/media-tidy.pipeline.md",
    phases: [
      { agent: "Researcher", consumes: "watchlist.md", produces: "plan.md", model: "sonnet", thinking: "low" },
      { agent: "Kodér", consumes: "plan.md", produces: "Holly/media/*", model: "sonnet", thinking: "low" },
    ],
  },
]

export const ACTIVITY: ActivityEvent[] = [
  { id: "e1", t: "teď", icon: "run", ctx: "home", text: "tmdb-renamer běží", sub: "přejmenováno 18 / 25 souborů" },
  { id: "e2", t: "2m", icon: "wait", ctx: "home", text: "rohlik čeká na schválení", sub: "košík připraven k objednání" },
  { id: "e3", t: "14m", icon: "ok", ctx: "work", text: "ci-doctor dokončen", sub: "opravil flaky test v auth-svc" },
  { id: "e4", t: "31m", icon: "ok", ctx: "home", text: "holly zálohoval vault", sub: "snapshot home/ · 2.3 GB" },
  { id: "e5", t: "1h", icon: "edit", ctx: "work", text: "standup-gen aktualizoval MEMORY.md", sub: "work/daily/2026-05-30.md" },
]
