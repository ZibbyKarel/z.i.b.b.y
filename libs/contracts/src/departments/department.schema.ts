import { z } from "zod";

/**
 * The eleven departments of ZibbyCorp (D-004). Each has a stable `id` used in
 * code/data, a short org-chart `code` (badge form), an English corporate `name`,
 * and Czech `tagline`/`mandate` copy. Fixed set — ZIBBY doesn't grow a twelfth
 * without a design decision, so this is a closed enum, not a free-form string.
 * Listed in canonical org-chart order: dev, ops, sec, rel, inc, rnd, com, qa,
 * knw, fin, per.
 */
export const DepartmentIdSchema = z.enum([
  "dev",
  "ops",
  "sec",
  "rel",
  "inc",
  "rnd",
  "com",
  "qa",
  "knw",
  "fin",
  "per",
]);
export type DepartmentId = z.infer<typeof DepartmentIdSchema>;

/**
 * A department's identity: its org-chart `code`, its English corporate `name`,
 * a short Czech tagline, its one-line Czech mandate, and a brand color.
 *
 * A department carries NO portrait. Phase 90 gave each one photographic hero art
 * under `/departments/*.jpg`, but the Velín-D design settles identity on the live
 * orb instead — the same orb on the map and in the detail header, colored by
 * `color` and moving with the department's state. The art was removed (with its
 * `heroImage` field) rather than left dark: two competing identity marks read as
 * two different objects. Recover the files from git history if it ever returns.
 */
export const DepartmentSchema = z.object({
  id: DepartmentIdSchema,
  code: z.string().min(1),
  name: z.string().min(1),
  tagline: z.string().min(1),
  mandate: z.string().min(1),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
});
export type Department = z.infer<typeof DepartmentSchema>;

/**
 * The registry — identity only, phase 80. Colors are the ZT palette hues
 * (Velín-D phase 2 alignment): dev `#5b8def`, comms `#56c4d6`, security
 * `#34c9bd`, research `#46cf8b`, release `#e0a83c`, incident `#f4785c`, ops
 * `#f2749e`, arch `#b07cff`, knowledge `#c56fd4`, finance `#a9c23e`, personal
 * `#d9694a`. Each color is the department's whole visual identity — it drives
 * the orb body on the map and its header echo.
 */
export const DEPARTMENTS: readonly Department[] = [
  {
    id: "dev",
    code: "DEV",
    name: "Development",
    tagline: "Vývoj a doručení",
    mandate:
      "Orchestrace delivery pipeline: Architekt → Kodér ⇄ Code-Review → Tester → Dokumentátor.",
    color: "#5b8def",
  },
  {
    id: "ops",
    code: "OPS",
    name: "Monitoring & Ops",
    tagline: "Provoz a monitoring",
    mandate: "Sledování kanálů, kalendáře a CI/CD na pravidelném heartbeatu.",
    color: "#f2749e",
  },
  {
    id: "sec",
    code: "SEC",
    name: "Security",
    tagline: "Bezpečnost a dohled",
    mandate: "Bezpečnost vůči externímu prostředí — CVE závislostí, úniky tajemství.",
    color: "#34c9bd",
  },
  {
    id: "rel",
    code: "REL",
    name: "Release Management",
    tagline: "Příprava a schvalování vydání",
    mandate: "Releasy — příprava, přehled a operátorem schválené sloučení.",
    color: "#e0a83c",
  },
  {
    id: "inc",
    code: "INC",
    name: "Incident Response",
    tagline: "Eskalace a řešení incidentů",
    mandate: "Eskalace incidentů — vlastní podoba Tier-3 kontraktu surface-and-wait.",
    color: "#f4785c",
  },
  {
    id: "rnd",
    code: "RND",
    name: "R&D",
    tagline: "Výzkum a analýza",
    mandate: "Výzkumné pipeline, které předávají výsledný artefakt dál.",
    color: "#46cf8b",
  },
  {
    id: "com",
    code: "COM",
    name: "Communications",
    tagline: "Komunikace navenek",
    mandate: "Mluví za ZIBBY navenek — reaktivní odpovědi i proaktivní dotazování.",
    color: "#56c4d6",
  },
  {
    id: "qa",
    code: "QA",
    name: "QA & Architecture",
    tagline: "Kvalita a architektura",
    mandate: "Proaktivní analýza kvality a architektury codebase, nálezy předává Dev.",
    color: "#b07cff",
  },
  {
    id: "knw",
    code: "KNW",
    name: "Knowledge Management",
    tagline: "Správa znalostí",
    mandate: "Správa paměti — vault, grounding, noční destilace a poličky znalostí.",
    color: "#c56fd4",
  },
  {
    id: "fin",
    code: "FIN",
    name: "Finance",
    tagline: "Rozpočty a limity",
    mandate: "Rozpočty a limity — stropy útrat, okna spotřeby, správa token-spend a limit-resume.",
    color: "#a9c23e",
  },
  {
    id: "per",
    code: "PER",
    name: "Personal Office",
    tagline: "Osobní záležitosti operátora",
    mandate:
      "Osobní život operátora — rychlé poznámky, denní agenda, osobní poličky a připomínky, oddělené od práce.",
    color: "#d9694a",
  },
];

/**
 * A department's current activity, as read by the top-level UI. `idle` idle,
 * `running` actively working (Tier 1, quiet), `report` has a Tier-2 report ready,
 * `waiting` needs a Tier-3 decision. Phase 80 always serves `idle`; real
 * aggregation across running pipelines/goals/approvals lands in phase 82.
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
 * The kind of stored entity that can carry an `department`. Pipelines/chains
 * have carried it since Phase 81; agents gained it in NS2 F1a. Integrations do
 * NOT carry it: an integration's department membership is DERIVED, not stored —
 * ops listens to every integration, comms replies through the reply-enabled
 * ones (per the mandate). See {@link DepartmentRosterSchema}.
 */
export const OwnableEntityKindSchema = z.enum(["pipeline", "agent"]);
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
 * stream — there is no standalone monitor entity. Pipelines/chains are NOT part
 * of this shape — the roster tab already sources those client-side (the canvas).
 */
export const DepartmentRosterSchema = z.object({
  agents: z.array(RosterAgentRefSchema),
  integrations: z.array(RosterIntegrationRefSchema),
  monitors: z.array(RosterIntegrationRefSchema),
});
export type DepartmentRoster = z.infer<typeof DepartmentRosterSchema>;
