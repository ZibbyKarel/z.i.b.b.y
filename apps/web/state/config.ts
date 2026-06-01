/**
 * Static dashboard configuration — navigation, target projects, option lists and
 * the (empty-system) quota readout. No domain content lives here: skills,
 * integrations, agents and pipelines all start empty and are created by the
 * user (see store.tsx). Files are the source of truth.
 */
import type { IconName, SelectOption } from "@zibby/design-system";
import type { AgentSdkCredit, ClaudeLimits } from "../domain";

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

export const NAV_ITEMS: NavConfig[] = [
  { id: "overview",     glyph: "grid",  href: "/overview" },
  { id: "skills",       glyph: "spark", href: "/skills" },
  { id: "agents",       glyph: "bot",   href: "/agents" },
  { id: "pipelines",    glyph: "flow",  href: "/pipelines" },
  { id: "integrations", glyph: "plug",  href: "/integrations" },
  { id: "automations",  glyph: "clock", href: "/automations" },
  { id: "memory",       glyph: "brain", href: "/memory" },
  { id: "runs",         glyph: "pulse", href: "/runs" },
];

export const SETTINGS_ITEM: NavConfig = {
  id: "settings",
  glyph: "gear",
  href: "/settings",
};

export const CONTEXT_OPTIONS: SelectOption[] = [
  { value: "home", label: "home" },
  { value: "work", label: "work" },
];

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
 * `label`, `short` and `resetIn` hold message-catalog keys (resolved with the
 * `limits.*` namespace at render), not display text — keeps this data module
 * free of UI strings. Numeric/technical fields (`tokens`, `usedPct`) stay raw.
 */
export const CLAUDE_LIMITS: ClaudeLimits = {
  rolling: {
    label: "limits.rollingLabel",
    short: "limits.rollingShort",
    usedPct: 0,
    resetIn: "limits.rollingReset",
    tokens: "0 / 200k",
  },
  weekly: {
    label: "limits.weeklyLabel",
    short: "limits.weeklyShort",
    usedPct: 0,
    resetIn: "limits.weeklyReset",
    tokens: "0 / 5M",
  },
};

export const AGENT_SDK: AgentSdkCredit = {
  label: "limits.agentSdkCredit",
  total: 200,
  used: 0,
  remaining: 200,
  usedPct: 0,
  renew: "limits.renewDate",
  byAgent: [],
  byPipeline: [],
  byContext: [],
  trend: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
};
