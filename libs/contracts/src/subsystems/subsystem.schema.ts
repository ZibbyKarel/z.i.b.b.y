import { z } from "zod";

/**
 * The eight named subsystems of the GAIA-style federation (design doc
 * `docs/superpowers/specs/2026-07-08-subsystem-federation-design.md`). Fixed set —
 * ZIBBY doesn't grow a ninth without a design decision, so this is a closed enum,
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
]);
export type SubsystemId = z.infer<typeof SubsystemIdSchema>;

/**
 * A subsystem's identity: its mythic name, a short Czech epithet, its one-line
 * Czech mandate (from the design doc's federation table), a brand color, and an
 * optional hero portrait. `heroImage` is a root-relative path or `null` — the
 * `null` fallback path (color-graded band) stays supported forever; phase 90
 * filled in `/subsystems/*.jpg` art for all eight.
 */
export const SubsystemSchema = z.object({
  id: SubsystemIdSchema,
  name: z.string().min(1),
  tagline: z.string().min(1),
  mandate: z.string().min(1),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  heroImage: z.string().nullable(),
});
export type Subsystem = z.infer<typeof SubsystemSchema>;

/**
 * The registry — identity only, phase 80. Colors are the ZT palette hues
 * (Velín-D phase 2 alignment): forge `#5b8def`, herald `#56c4d6`, sentinel
 * `#34c9bd`, scout `#46cf8b`, maestro `#e0a83c`, beacon `#f4785c`, puls
 * `#f2749e`, loom `#b07cff`. `heroImage` points at the phase-90 hero art in
 * `apps/web/public/subsystems/` (one visual family, style-locked to
 * `design/Z.I.B.B.Y/uploads/Forge.png`).
 */
export const SUBSYSTEMS: readonly Subsystem[] = [
  {
    id: "forge",
    name: "Forge",
    tagline: "Kovárna doručení",
    mandate:
      "Orchestrace delivery pipeline: Architekt → Kodér ⇄ Code-Review → Tester → Dokumentátor.",
    color: "#5b8def",
    heroImage: "/subsystems/forge.jpg",
  },
  {
    id: "puls",
    name: "Puls",
    tagline: "Tep systému",
    mandate: "Sledování kanálů, kalendáře a CI/CD na srdečním tepu.",
    color: "#f2749e",
    heroImage: "/subsystems/puls.jpg",
  },
  {
    id: "sentinel",
    name: "Sentinel",
    tagline: "Strážce hranic",
    mandate: "Bezpečnost vůči externímu prostředí — CVE závislostí, úniky tajemství.",
    color: "#34c9bd",
    heroImage: "/subsystems/sentinel.jpg",
  },
  {
    id: "maestro",
    name: "Maestro",
    tagline: "Dirigent vydání",
    mandate: "Releasy — příprava, přehled a operátorem schválené sloučení.",
    color: "#e0a83c",
    heroImage: "/subsystems/maestro.jpg",
  },
  {
    id: "beacon",
    name: "Beacon",
    tagline: "Maják v noci",
    mandate: "Eskalace incidentů — vlastní podoba Tier-3 kontraktu surface-and-wait.",
    color: "#f4785c",
    heroImage: "/subsystems/beacon.jpg",
  },
  {
    id: "scout",
    name: "Scout",
    tagline: "Zvěd na cestách",
    mandate: "Výzkumné pipeline, které předávají výsledný artefakt dál.",
    color: "#46cf8b",
    heroImage: "/subsystems/scout.jpg",
  },
  {
    id: "herald",
    name: "Herald",
    tagline: "Hlas navenek",
    mandate: "Mluví za ZIBBY navenek — reaktivní odpovědi i proaktivní dotazování.",
    color: "#56c4d6",
    heroImage: "/subsystems/herald.jpg",
  },
  {
    id: "loom",
    name: "Loom",
    tagline: "Tkadlec kvality",
    mandate: "Proaktivní analýza kvality a architektury codebase, nálezy předává Forge.",
    color: "#b07cff",
    heroImage: "/subsystems/loom.jpg",
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
