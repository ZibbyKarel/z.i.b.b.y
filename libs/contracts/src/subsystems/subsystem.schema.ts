import { z } from "zod";

/**
 * The ten named subsystems of the GAIA-style federation (design doc
 * `docs/superpowers/specs/2026-07-08-subsystem-federation-design.md`; codex +
 * ledger seated in NS2 F1a). Fixed set — ZIBBY doesn't grow an eleventh without a
 * design decision, so this is a closed enum, not a free-form string.
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
 * `#f2749e`, loom `#b07cff`, codex `#c56fd4`, ledger `#a9c23e`. Each color is
 * the subsystem's whole visual identity — it drives the orb body on the map
 * and its header echo.
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
];

/**
 * A subsystem's current activity, as read by the top-level UI. `idle` idle,
 * `running` actively working (Tier 1, quiet), `report` has a Tier-2 report ready,
 * `waiting` needs a Tier-3 decision. Phase 80 always serves `idle`; real
 * aggregation across running pipelines/goals/approvals lands in phase 82.
 */
export const SubsystemStateSchema = z.enum(["idle", "running", "report", "waiting"]);
export type SubsystemState = z.infer<typeof SubsystemStateSchema>;

/**
 * A subsystem's identity plus its live status: `state` plus how many Tier-2
 * (act-then-report) and Tier-3 (surface-and-wait) items are outstanding. The
 * shape lands in phase 80 so the web query is stable; phase 82 fills in real
 * counts instead of the phase-80 stub `{ state: "idle", tier2Count: 0, tier3Count: 0 }`.
 */
export const SubsystemWithStatusSchema = SubsystemSchema.extend({
  state: SubsystemStateSchema,
  tier2Count: z.number().int().nonnegative(),
  tier3Count: z.number().int().nonnegative(),
});
export type SubsystemWithStatus = z.infer<typeof SubsystemWithStatusSchema>;
