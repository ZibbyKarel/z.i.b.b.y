import { describe, expect, it } from "vitest";
import type { CommandPaletteLabels } from "./types";
import { type CommandPaletteSources, buildCommandPaletteIndex } from "./buildIndex";
import { GATE_SECTIONS, SETTINGS_SECTIONS } from "./staticSections";

const LABELS: CommandPaletteLabels = {
  kind: {
    department: "Department",
    person: "Person",
    task: "Task",
    chain: "Chain",
    goal: "Goal",
    company: "Company",
    team: "Team",
    project: "Project",
    pipeline: "Pipeline",
    skill: "Skill",
    mcp: "MCP server",
    hook: "Hook",
    command: "Command",
    automation: "Automation",
    signal: "Signal",
    note: "Note",
    setting: "Setting",
    gate: "Gate",
    action: "Action",
  },
  group: {
    actions: "Actions",
    departments: "Departments",
    people: "People",
    tasks: "Tasks",
    chains: "Chains",
    goals: "Goals",
    companies: "Companies",
    teams: "Teams",
    projects: "Projects",
    pipelines: "Pipelines",
    registries: "Registries",
    automations: "Automations",
    signals: "Signals",
    vault: "Vault",
    settings: "Settings",
    gates: "Gates",
  },
  settingsSection: Object.fromEntries(SETTINGS_SECTIONS.map((s) => [s, s])),
  gateSection: Object.fromEntries(GATE_SECTIONS.map((s) => [s, s])),
  actions: { newTask: "New task", approveNext: "Approve next", toggleTheme: "Toggle theme" },
};

const EMPTY_SOURCES: CommandPaletteSources = {
  departments: [],
  people: [],
  tasks: [],
  chains: [],
  goals: [],
  companies: [],
  teams: [],
  projects: [],
  pipelines: [],
  skills: [],
  mcpServers: [],
  hooks: [],
  commands: [],
  automations: [],
  signals: [],
  notes: [],
  hasPendingApproval: false,
};

describe("buildCommandPaletteIndex", () => {
  it("always includes New task and Toggle theme, never Approve next with nothing pending", () => {
    const entries = buildCommandPaletteIndex(EMPTY_SOURCES, LABELS);
    const actionIds = entries.filter((e) => e.group === "actions").map((e) => e.actionId);
    expect(actionIds).toEqual(["new-task", "toggle-theme"]);
  });

  it("adds Approve next once a pending approval exists", () => {
    const entries = buildCommandPaletteIndex(
      { ...EMPTY_SOURCES, hasPendingApproval: true },
      LABELS,
    );
    const actionIds = entries.filter((e) => e.group === "actions").map((e) => e.actionId);
    expect(actionIds).toContain("approve-next");
  });

  it("routes a department to its team tab", () => {
    const entries = buildCommandPaletteIndex(
      { ...EMPTY_SOURCES, departments: [{ id: "dev", name: "Development" }] },
      LABELS,
    );
    expect(entries).toContainEqual(
      expect.objectContaining({
        id: "dev",
        group: "departments",
        kind: "department",
        label: "Development",
        href: "/org/departments/dev/team",
      }),
    );
  });

  it("routes a person to their profile", () => {
    const entries = buildCommandPaletteIndex(
      { ...EMPTY_SOURCES, people: [{ id: "alice", name: "Alice", department: "dev" }] },
      LABELS,
    );
    expect(entries).toContainEqual(
      expect.objectContaining({
        id: "alice",
        group: "people",
        kind: "person",
        label: "Alice",
        meta: "dev",
        href: "/org/people/alice",
      }),
    );
  });

  it("skips a pipeline with no owning department (the route has no unresolved form)", () => {
    const entries = buildCommandPaletteIndex(
      {
        ...EMPTY_SOURCES,
        pipelines: [
          { id: "no-dept", name: "Orphan" },
          { id: "p1", name: "Delivery", department: "dev" },
        ],
      },
      LABELS,
    );
    const ids = entries.filter((e) => e.group === "pipelines").map((e) => e.id);
    expect(ids).toEqual(["p1"]);
  });

  it("groups every registry kind under the single registries bucket", () => {
    const entries = buildCommandPaletteIndex(
      {
        ...EMPTY_SOURCES,
        skills: [{ id: "s1", name: "Skill One" }],
        mcpServers: [{ id: "m1", name: "MCP One" }],
        hooks: [{ id: "h1", name: "Hook One", event: "PreToolUse" }],
        commands: [{ id: "c1", description: "Command one" }],
      },
      LABELS,
    );
    const registryEntries = entries.filter((e) => e.group === "registries");
    expect(registryEntries.map((e) => e.kind).sort()).toEqual(["command", "hook", "mcp", "skill"]);
    expect(registryEntries.find((e) => e.kind === "skill")?.href).toBe(
      "/system/registries/skills/s1",
    );
    expect(registryEntries.find((e) => e.kind === "mcp")?.href).toBe("/system/registries/mcp/m1");
    expect(registryEntries.find((e) => e.kind === "hook")?.href).toBe(
      "/system/registries/hooks/h1",
    );
    expect(registryEntries.find((e) => e.kind === "command")?.href).toBe(
      "/system/registries/commands/c1",
    );
  });

  it("routes a signal to the policy gates signals section with its id", () => {
    const entries = buildCommandPaletteIndex(
      { ...EMPTY_SOURCES, signals: [{ id: "cve", label: "CVE" }] },
      LABELS,
    );
    expect(entries).toContainEqual(
      expect.objectContaining({
        id: "cve",
        group: "signals",
        href: "/policy/gates?section=signals&id=cve",
      }),
    );
  });

  it("routes a vault note by its id, URL-encoded", () => {
    const entries = buildCommandPaletteIndex(
      { ...EMPTY_SOURCES, notes: [{ id: "daily/2026-09-25", title: "Today" }] },
      LABELS,
    );
    expect(entries).toContainEqual(
      expect.objectContaining({
        id: "daily/2026-09-25",
        group: "vault",
        href: "/knowledge/vault?note=daily%2F2026-09-25",
      }),
    );
  });

  it("always carries the full static settings and gate catalogs", () => {
    const entries = buildCommandPaletteIndex(EMPTY_SOURCES, LABELS);
    const settingsIds = entries.filter((e) => e.group === "settings").map((e) => e.id);
    const gateIds = entries.filter((e) => e.group === "gates").map((e) => e.id);
    expect(settingsIds).toEqual([...SETTINGS_SECTIONS]);
    expect(gateIds).toEqual([...GATE_SECTIONS]);
    expect(entries.find((e) => e.id === "automations" && e.group === "settings")?.href).toBe(
      "/system/settings/automations",
    );
    expect(entries.find((e) => e.id === "signals" && e.group === "gates")?.href).toBe(
      "/policy/gates?section=signals",
    );
  });

  it("routes every automation to the global automations settings page (no per-department mapping yet)", () => {
    const entries = buildCommandPaletteIndex(
      { ...EMPTY_SOURCES, automations: [{ id: "security-scan", name: "Security scan" }] },
      LABELS,
    );
    expect(entries).toContainEqual(
      expect.objectContaining({
        id: "security-scan",
        group: "automations",
        href: "/system/settings/automations",
      }),
    );
  });
});
