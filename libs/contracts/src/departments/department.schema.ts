import { z } from "zod";

/**
 * Open set since D-022: departments are data files under
 * `.zibby/data/departments/`, created on demand (`POST /departments`). The id is
 * a slug; whether a given id EXISTS is a runtime check against the store, not a
 * schema fact. {@link DEPARTMENT_SEED} holds the original eleven (D-004), written
 * to disk once on first boot. Org-chart order: dev, ops, sec, rel, inc, rnd, com,
 * qa, knw, fin, per.
 */
export const DepartmentIdSchema = z.string().regex(/^[a-z][a-z0-9-]{1,23}$/);
export type DepartmentId = z.infer<typeof DepartmentIdSchema>;

/**
 * D-021 — divisions group departments so the org reads as COO → division →
 * department. A division is a GROUPING only: it owns nothing. Stored in
 * `_divisions.json`, listed by `order`.
 */
export const DivisionIdSchema = z.string().regex(/^[a-z][a-z0-9-]{1,23}$/);
export type DivisionId = z.infer<typeof DivisionIdSchema>;

export const DivisionSchema = z
  .object({ id: DivisionIdSchema, name: z.string().min(1), order: z.number().int() })
  .strict();
export type Division = z.infer<typeof DivisionSchema>;

/** Stage-2 classifier terminal fallback (was `DEPARTMENT_FALLBACK`). */
export const DepartmentFallbackSchema = z.enum(["primary", "orchestrator"]);
export type DepartmentFallback = z.infer<typeof DepartmentFallbackSchema>;

/** Default gate decision for a department's actions (was `DEPARTMENT_TIER_DEFAULT`). */
export const DepartmentTierDefaultSchema = z.enum(["ask", "deny", "allow", "notify"]).nullable();
export type DepartmentTierDefault = z.infer<typeof DepartmentTierDefaultSchema>;

/**
 * A department: org-chart `code`, English `name`, Czech `tagline`/`mandate`, a
 * brand `color` (drives the live orb), plus the per-department policy that used
 * to live in three closed `Record` maps — `icon`, `fallback`, `tierDefault`.
 * It carries NO portrait (the Velín-D design settles identity on the orb).
 */
export const DepartmentSchema = z
  .object({
    id: DepartmentIdSchema,
    code: z.string().regex(/^[A-Z0-9]{2,6}$/),
    name: z.string().min(1).max(64),
    tagline: z.string().max(120),
    mandate: z.string().max(2000),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    division: DivisionIdSchema,
    /** Design-system icon name shown on the org map and chips (was DEPARTMENT_GLYPH). */
    icon: z.string().min(1).default("folder"),
    /** Stage-2 classifier terminal fallback (was DEPARTMENT_FALLBACK). */
    fallback: DepartmentFallbackSchema.default("primary"),
    /** Default gate decision for this department's actions (was DEPARTMENT_TIER_DEFAULT). */
    tierDefault: DepartmentTierDefaultSchema.default(null),
    createdAt: z.string().datetime().optional(),
  })
  .strict();
export type Department = z.infer<typeof DepartmentSchema>;

export const CreateDepartmentInputSchema = DepartmentSchema.omit({ createdAt: true });
export type CreateDepartmentInput = z.infer<typeof CreateDepartmentInputSchema>;

export const UpdateDepartmentInputSchema = DepartmentSchema.omit({
  id: true,
  createdAt: true,
}).partial();
export type UpdateDepartmentInput = z.infer<typeof UpdateDepartmentInputSchema>;

/** Seed only — written to `.zibby/data/departments/` on first boot, never read at runtime. */
export const DIVISION_SEED: readonly Division[] = [
  { id: "engineering", name: "Engineering", order: 0 },
  { id: "operations", name: "Infrastructure & Operations", order: 1 },
  { id: "business", name: "Business Operations", order: 2 },
  { id: "office", name: "Office of the CEO", order: 3 },
];

/**
 * Seed only — the original eleven (D-004). Colors are the ZT palette hues
 * (Velín-D). Written to disk once; the stored file always wins afterwards.
 */
export const DEPARTMENT_SEED: readonly Department[] = [
  {
    id: "dev",
    code: "DEV",
    name: "Development",
    tagline: "Vývoj a doručení",
    mandate:
      "Orchestrace delivery workflow: Architekt → Kodér ⇄ Code-Review → Tester → Dokumentátor.",
    color: "#5b8def",
    division: "engineering",
    icon: "code",
    fallback: "primary",
    tierDefault: null,
  },
  {
    id: "ops",
    code: "OPS",
    name: "Monitoring & Ops",
    tagline: "Provoz a monitoring",
    mandate: "Sledování kanálů, kalendáře a CI/CD na pravidelném heartbeatu.",
    color: "#f2749e",
    division: "operations",
    icon: "pulse",
    fallback: "primary",
    tierDefault: null,
  },
  {
    id: "sec",
    code: "SEC",
    name: "Security",
    tagline: "Bezpečnost a dohled",
    mandate: "Bezpečnost vůči externímu prostředí — CVE závislostí, úniky tajemství.",
    color: "#34c9bd",
    division: "operations",
    icon: "shield",
    fallback: "primary",
    tierDefault: null,
  },
  {
    id: "rel",
    code: "REL",
    name: "Release Management",
    tagline: "Příprava a schvalování vydání",
    mandate: "Releasy — příprava, přehled a operátorem schválené sloučení.",
    color: "#e0a83c",
    division: "operations",
    icon: "checkpoint",
    fallback: "primary",
    tierDefault: null,
  },
  {
    id: "inc",
    code: "INC",
    name: "Incident Response",
    tagline: "Eskalace a řešení incidentů",
    mandate: "Eskalace incidentů — vlastní podoba Tier-3 kontraktu surface-and-wait.",
    color: "#f4785c",
    division: "operations",
    icon: "warn",
    fallback: "orchestrator",
    tierDefault: "ask",
  },
  {
    id: "rnd",
    code: "RND",
    name: "R&D",
    tagline: "Výzkum a analýza",
    mandate: "Výzkumné workflow, které předávají výsledný artefakt dál.",
    color: "#46cf8b",
    division: "engineering",
    icon: "compass",
    fallback: "primary",
    tierDefault: null,
  },
  {
    id: "com",
    code: "COM",
    name: "Communications",
    tagline: "Komunikace navenek",
    mandate: "Mluví za ZIBBY navenek — reaktivní odpovědi i proaktivní dotazování.",
    color: "#56c4d6",
    division: "business",
    icon: "link",
    fallback: "primary",
    tierDefault: null,
  },
  {
    id: "qa",
    code: "QA",
    name: "QA & Architecture",
    tagline: "Kvalita a architektura",
    mandate: "Proaktivní analýza kvality a architektury codebase, nálezy předává Dev.",
    color: "#b07cff",
    division: "engineering",
    icon: "search",
    fallback: "primary",
    tierDefault: null,
  },
  {
    id: "knw",
    code: "KNW",
    name: "Knowledge Management",
    tagline: "Správa znalostí",
    mandate: "Správa paměti — vault, grounding, noční destilace a poličky znalostí.",
    color: "#c56fd4",
    division: "business",
    icon: "brain",
    fallback: "primary",
    tierDefault: null,
  },
  {
    id: "fin",
    code: "FIN",
    name: "Finance",
    tagline: "Rozpočty a limity",
    mandate: "Rozpočty a limity — stropy útrat, okna spotřeby, správa token-spend a limit-resume.",
    color: "#a9c23e",
    division: "business",
    icon: "dollar",
    fallback: "orchestrator",
    tierDefault: null,
  },
  {
    id: "per",
    code: "PER",
    name: "Personal Office",
    tagline: "Osobní záležitosti operátora",
    mandate:
      "Osobní život operátora — rychlé poznámky, denní agenda, osobní poličky a připomínky, oddělené od práce.",
    color: "#d9694a",
    division: "office",
    icon: "coffee",
    fallback: "primary",
    tierDefault: null,
  },
];

/** @deprecated read departments from the API — kept for the web until P0-03. */
export const DEPARTMENTS: readonly Department[] = DEPARTMENT_SEED;
/** @deprecated read divisions from the API — kept for the web until P0-03. */
export const DIVISIONS: readonly Division[] = DIVISION_SEED;

/**
 * A department's current activity, as read by the top-level UI. `idle` idle,
 * `running` actively working (Tier 1, quiet), `report` has a Tier-2 report ready,
 * `waiting` needs a Tier-3 decision. Phase 80 always serves `idle`; real
 * aggregation across running workflows/goals/approvals lands in phase 82.
 */
export const DepartmentStateSchema = z.enum(["idle", "running", "report", "waiting", "error"]);
export type DepartmentState = z.infer<typeof DepartmentStateSchema>;

/**
 * A department's identity plus its live status: `state` plus how many Tier-2
 * (act-then-report) and Tier-3 (surface-and-wait) items are outstanding, plus
 * how many owned runs failed. `tier2Count` counts only SUCCESSFUL (`done`)
 * terminal runs since last seen — a failed run counts toward `errorCount`
 * instead, never both. `errorRunIds` names the runs behind `errorCount`, so a
 * client can show what actually failed.
 */
export const DepartmentWithStatusSchema = DepartmentSchema.extend({
  state: DepartmentStateSchema,
  tier2Count: z.number().int().nonnegative(),
  tier3Count: z.number().int().nonnegative(),
  errorCount: z.number().int().nonnegative(),
  errorRunIds: z.array(z.string().min(1)).optional(),
});
export type DepartmentWithStatus = z.infer<typeof DepartmentWithStatusSchema>;

/**
 * The kind of stored entity that can carry an `department`. Workflows/chains
 * have carried it since Phase 81; agents gained it in NS2 F1a. Integrations do
 * NOT carry it: an integration's department membership is DERIVED, not stored —
 * ops listens to every integration, comms replies through the reply-enabled
 * ones (per the mandate). See {@link DepartmentRosterSchema}.
 */
export const OwnableEntityKindSchema = z.enum(["workflow", "agent"]);
export type OwnableEntityKind = z.infer<typeof OwnableEntityKindSchema>;

/**
 * One entity the owner-backfill sweep (F1b) could not attribute to a department
 * — surfaced via `GET /api/departments/unowned` rather than folded into the
 * health read-model (a closed infra enum, not the place for an ownership gap).
 * Post-backfill this list is `[]` for the seeded fleet; it exists so a NEWLY
 * created entity that somehow slips past the write-time 422 (or a hand-edited
 * file) is still discoverable.
 */
export const UnownedEntitySchema = z.object({
  kind: OwnableEntityKindSchema,
  id: z.string().min(1),
});
export type UnownedEntity = z.infer<typeof UnownedEntitySchema>;

/** A minimal ref into an owned agent — enough for the roster's crew row + link. */
export const RosterAgentRefSchema = z.object({
  id: z.string().min(1),
  name: z.string().optional(),
});
export type RosterAgentRef = z.infer<typeof RosterAgentRefSchema>;

/** A minimal ref into an owned integration (also used for the `monitors` subset). */
export const RosterIntegrationRefSchema = z.object({
  id: z.string().min(1),
  name: z.string().optional(),
  kind: z.string().min(1),
});
export type RosterIntegrationRef = z.infer<typeof RosterIntegrationRefSchema>;

/**
 * A department's roster. `agents` is read off stored `department` tags.
 * `integrations` is DERIVED, not stored: ops (the heartbeat watcher) lists
 * every integration; comms (the outward voice) lists the reply-enabled ones
 * (`mandate.reply`); every other department lists none. `monitors` is the subset
 * of that department's `integrations` that are GitHub integrations with a `ci`
 * stream — there is no standalone monitor entity. Workflows/chains are NOT part
 * of this shape — the roster tab already sources those client-side (the canvas).
 */
export const DepartmentRosterSchema = z.object({
  agents: z.array(RosterAgentRefSchema),
  integrations: z.array(RosterIntegrationRefSchema),
  monitors: z.array(RosterIntegrationRefSchema),
});
export type DepartmentRoster = z.infer<typeof DepartmentRosterSchema>;
