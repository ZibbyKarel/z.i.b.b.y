/**
 * Static dashboard configuration — navigation, target projects, option lists and
 * the (empty-system) quota readout. No domain content lives here: skills,
 * integrations, agents and pipelines all start empty and are created by the
 * user (see store.tsx). Files are the source of truth.
 */
import type { IconName, SelectOption } from "@zibby/design-system";
import type { AgentCategory, AgentSdkCredit, ClaudeLimits } from "../domain";

export const PROJECTS = [
  "zibby-core",
  "home-ops",
  "media-vault",
  "~/cesta/k/projektu",
] as const;

/**
 * Navigation entry without a display label — the label is resolved from the
 * `nav.<id>` message catalog at render time (see AppShell), so no UI text lives
 * in this data module.
 */
export interface NavConfig {
  id: string;
  glyph: IconName;
  href: string;
}

export const NAV_ITEMS = [
  { id: "overview",     glyph: "grid",  href: "/overview" },
  { id: "skills",       glyph: "spark", href: "/skills" },
  { id: "agents",       glyph: "bot",   href: "/agents" },
  { id: "pipelines",    glyph: "flow",  href: "/pipelines" },
  { id: "integrations", glyph: "plug",  href: "/integrations" },
  { id: "automations",  glyph: "clock", href: "/automations" },
  { id: "memory",       glyph: "brain", href: "/memory" },
  { id: "runs",         glyph: "pulse", href: "/runs" },
] as const satisfies readonly NavConfig[];

export const SETTINGS_ITEM = {
  id: "settings",
  glyph: "gear",
  href: "/settings",
} as const satisfies NavConfig;

/**
 * A navigation segment id — the `id` of any nav item (incl. settings). These
 * double as keys under the `nav.<id>` message catalog, so typing them as a
 * union lets `t(navId)` be validated at compile time.
 */
export type NavId = (typeof NAV_ITEMS)[number]["id"] | (typeof SETTINGS_ITEM)["id"];

export const MODEL_OPTIONS: SelectOption[] = [
  { value: "opus", label: "opus" },
  { value: "sonnet", label: "sonnet" },
  { value: "haiku", label: "haiku" },
];

export const THINKING_OPTIONS: SelectOption[] = [
  { value: "high", label: "high" },
  { value: "medium", label: "medium" },
  { value: "low", label: "low" },
];

/**
 * Quota widget data for a fresh system: nothing has run yet, so interactive
 * limits are at zero and the Agent SDK credit is full.
 */
/**
 * `label`, `short`, `resetIn` and `age` hold message-catalog keys (resolved with
 * the `limits.*` namespace at render), not display text — keeps this data module
 * free of UI strings. `usedPct` stays raw. This is the zero-usage fallback shown
 * before the first poll, so it reads as `stale` (no live capture yet).
 */
export const CLAUDE_LIMITS: ClaudeLimits = {
  rolling: {
    label: "limits.rollingLabel",
    short: "limits.rollingShort",
    usedPct: 0,
    resetIn: "limits.rollingReset",
    age: "limits.stale",
  },
  weekly: {
    label: "limits.weeklyLabel",
    short: "limits.weeklyShort",
    usedPct: 0,
    resetIn: "limits.weeklyReset",
    age: "limits.stale",
  },
};

/** Agent catalog taxonomy. Category ids are stable keys resolved via `agents.categories.<id>`. */
export const AGENT_CATEGORIES = [
  "media",
  "household",
  "writing",
  "dev",
  "quality",
  "research",
  "docs",
] as const satisfies readonly AgentCategory[];

/** Glyph shown next to each category section header. */
export const AGENT_CATEGORY_GLYPH: Record<string, IconName> = {
  media: "film",
  household: "cart",
  writing: "doc",
  dev: "code",
  quality: "shield",
  research: "search",
  docs: "spark",
};

/** Glyphs offered in the agent editor's icon picker. */
export const AGENT_GLYPHS: IconName[] = [
  "compass",
  "code",
  "flask",
  "doc",
  "check",
  "search",
  "bot",
  "brain",
  "shield",
  "spark",
  "film",
  "cart",
  "server",
  "flow",
  "gear",
];

/** Tools an agent can be granted in the editor. */
export const AGENT_TOOLS = ["read", "write", "bash", "git", "web"] as const;

export const AGENT_SDK: AgentSdkCredit = {
  label: "limits.agentSdkCredit",
  total: 200,
  used: 0,
  remaining: 200,
  usedPct: 0,
  renew: "limits.renewDate",
  byAgent: [],
  byPipeline: [],
  trend: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
};
