import { z } from "zod";

/**
 * The eleven named subsystems of the GAIA-style federation (design doc
 * `docs/superpowers/specs/2026-07-08-subsystem-federation-design.md`; codex +
 * ledger seated in NS2 F1a; hearth seated in NS2 F8a per the operator ruling in
 * `docs/ns2/DECISIONS.md` — "hearth (personal domain) in F8"). Fixed set — ZIBBY
 * doesn't grow a twelfth without a design decision, so this is a closed enum,
 * not a free-form string.
 */
export const SubsystemIdSchema = z.enum([
  "forge",
  "puls",
  "sentinel",
  "maestro",
  "beacon",
  "scout",
  "herald",
  "loom",
  "codex",
  "ledger",
  "hearth",
]);
export type SubsystemId = z.infer<typeof SubsystemIdSchema>;

/**
 * A subsystem's identity: its mythic name, a short Czech epithet, its one-line
 * Czech mandate (from the design doc's federation table), and a brand color.
 *
 * A subsystem carries NO portrait. Phase 90 gave each one photographic hero art
 * under `/subsystems/*.jpg`, but the Velín-D design settles identity on the live
 * orb instead — the same orb on the map and in the detail header, colored by
 * `color` and moving with the subsystem's state. The art was removed (with its
 * `heroImage` field) rather than left dark: two competing identity marks read as
 * two different objects. Recover the files from git history if it ever returns.
 */
export const SubsystemSchema = z.object({
  id: SubsystemIdSchema,
  name: z.string().min(1),
  tagline: z.string().min(1),
  mandate: z.string().min(1),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
});
export type Subsystem = z.infer<typeof SubsystemSchema>;

/**
 * The registry — identity only, phase 80. Colors are the ZT palette hues
 * (Velín-D phase 2 alignment): forge `#5b8def`, herald `#56c4d6`, sentinel
 * `#34c9bd`, scout `#46cf8b`, maestro `#e0a83c`, beacon `#f4785c`, puls
 * `#f2749e`, loom `#b07cff`, codex `#c56fd4`, ledger `#a9c23e`, hearth
 * `#d9694a`. Each color is the subsystem's whole visual identity — it drives
 * the orb body on the map and its header echo.
 */
export const SUBSYSTEMS: readonly Subsystem[] = [
  {
    id: "forge",
    name: "Forge",
    tagline: "Kovárna doručení",
    mandate:
      "Orchestrace delivery pipeline: Architekt → Kodér ⇄ Code-Review → Tester → Dokumentátor.",
    color: "#5b8def",
  },
  {
    id: "puls",
    name: "Puls",
    tagline: "Tep systému",
    mandate: "Sledování kanálů, kalendáře a CI/CD na srdečním tepu.",
    color: "#f2749e",
  },
  {
    id: "sentinel",
    name: "Sentinel",
    tagline: "Strážce hranic",
    mandate: "Bezpečnost vůči externímu prostředí — CVE závislostí, úniky tajemství.",
    color: "#34c9bd",
  },
  {
    id: "maestro",
    name: "Maestro",
    tagline: "Dirigent vydání",
    mandate: "Releasy — příprava, přehled a operátorem schválené sloučení.",
    color: "#e0a83c",
  },
  {
    id: "beacon",
    name: "Beacon",
    tagline: "Maják v noci",
    mandate: "Eskalace incidentů — vlastní podoba Tier-3 kontraktu surface-and-wait.",
    color: "#f4785c",
  },
  {
    id: "scout",
    name: "Scout",
    tagline: "Zvěd na cestách",
    mandate: "Výzkumné pipeline, které předávají výsledný artefakt dál.",
    color: "#46cf8b",
  },
  {
    id: "herald",
    name: "Herald",
    tagline: "Hlas navenek",
    mandate: "Mluví za ZIBBY navenek — reaktivní odpovědi i proaktivní dotazování.",
    color: "#56c4d6",
  },
  {
    id: "loom",
    name: "Loom",
    tagline: "Tkadlec kvality",
    mandate: "Proaktivní analýza kvality a architektury codebase, nálezy předává Forge.",
    color: "#b07cff",
  },
  {
    id: "codex",
    name: "Codex",
    tagline: "Paměť rodu",
    mandate: "Správa paměti — vault, grounding, noční destilace a poličky znalostí.",
    color: "#c56fd4",
  },
  {
    id: "ledger",
    name: "Ledger",
    tagline: "Správce pokladny",
    mandate: "Rozpočty a limity — stropy útrat, okna spotřeby, správa token-spend a limit-resume.",
    color: "#a9c23e",
  },
  {
    id: "hearth",
    name: "Hearth",
    tagline: "Krb domova",
    mandate:
      "Osobní život operátora — rychlé poznámky, denní agenda, osobní poličky a připomínky, oddělené od práce.",
    color: "#d9694a",
  },
];

/**
 * A subsystem's current activity, as read by the top-level UI. `idle` idle,
 * `running` actively working (Tier 1, quiet), `report` has a Tier-2 report ready,
 * `waiting` needs a Tier-3 decision. Phase 80 always serves `idle`; real
 * aggregation across running pipelines/goals/approvals lands in phase 82.
 */
export const SubsystemStateSchema = z.enum(["idle", "running", "report", "waiting", "error"]);
export type SubsystemState = z.infer<typeof SubsystemStateSchema>;

/**
 * A subsystem's identity plus its live status: `state` plus how many Tier-2
 * (act-then-report) and Tier-3 (surface-and-wait) items are outstanding, plus
 * how many owned runs failed. `tier2Count` counts only SUCCESSFUL (`done`)
 * terminal runs since last seen — a failed run counts toward `errorCount`
 * instead, never both.
 */
export const SubsystemWithStatusSchema = SubsystemSchema.extend({
  state: SubsystemStateSchema,
  tier2Count: z.number().int().nonnegative(),
  tier3Count: z.number().int().nonnegative(),
  errorCount: z.number().int().nonnegative(),
});
export type SubsystemWithStatus = z.infer<typeof SubsystemWithStatusSchema>;

/**
 * NS2 F1b — the kind of stored entity that can carry an `ownerSubsystem`.
 * Pipelines/chains have carried it since Phase 81; agents/integrations gained
 * it in F1a. There is no standalone monitor entity (a monitor is a ci-stream
 * GitHub integration), so monitor ownership is covered by `"integration"`.
 */
export const OwnableEntityKindSchema = z.enum(["pipeline", "agent", "integration"]);
export type OwnableEntityKind = z.infer<typeof OwnableEntityKindSchema>;

/**
 * One entity the owner-backfill sweep (F1b) could not attribute to a subsystem
 * — surfaced via `GET /api/subsystems/unowned` rather than folded into the
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
 * NS2 F1c — a subsystem's stored roster, read directly off `ownerSubsystem`
 * tags rather than derived client-side from pipeline phases (the old
 * `deriveCrew`). `monitors` is a subset of `integrations` (owned GitHub
 * integrations with a `ci` stream) — there is no standalone monitor entity,
 * see {@link OwnableEntityKindSchema}'s doc. Pipelines/chains are NOT part of
 * this shape — the roster tab already sources those client-side (the canvas),
 * so serving them here would duplicate data.
 */
export const SubsystemRosterSchema = z.object({
  agents: z.array(RosterAgentRefSchema),
  integrations: z.array(RosterIntegrationRefSchema),
  monitors: z.array(RosterIntegrationRefSchema),
});
export type SubsystemRoster = z.infer<typeof SubsystemRosterSchema>;
