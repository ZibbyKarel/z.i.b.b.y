import { z } from "zod";
import { IsoDateTimeSchema } from "../common.schema";

/**
 * Phase 4 — Autopilot. `off` is the normal gate; `full` is an operator-switched,
 * temporary overlay that resolves the covered `ask` classes picked in its `scope` (PR
 * reviews, addressing review comments, concrete channel replies) plus pushes onto ZIBBY's
 * or the operator's own PR branches as act-then-report (Tier 2). Never-rules, merge and every other `ask` are untouched.
 */
export const AutopilotLevelSchema = z.enum(["off", "full"]);
export type AutopilotLevel = z.infer<typeof AutopilotLevelSchema>;

/** Who switched it: the dashboard with the operator token, or the operator chat (off only). */
export const AutopilotActorSchema = z.enum(["operator", "chat"]);
export type AutopilotActor = z.infer<typeof AutopilotActorSchema>;

/**
 * Which covered classes the gate overlay decides. Derived from the automation tree
 * ({@link AUTOPILOT_SCOPE_TOGGLE}); stored on its own only by states written before the
 * tree carried every class. Pushes onto ZIBBY's or the operator's own PR branches are not
 * a toggle: they ride along with whichever class produced them (a `pr-fix-ci` push is
 * always covered while on).
 * - `reviews` — post ZIBBY's finished PR code reviews;
 * - `comments` — address review comments: push the fixes, post the thread replies;
 * - `communication` — concrete replies in channels (GitHub/GitLab/Jira questions, Slack).
 */
export const AutopilotScopeSchema = z
  .object({ reviews: z.boolean(), comments: z.boolean(), communication: z.boolean() })
  .strict();
export type AutopilotScope = z.infer<typeof AutopilotScopeSchema>;
export type AutopilotScopeKey = keyof AutopilotScope;

/** A legacy `full` state without `scope` or tree (written before the toggles existed) covers everything. */
export const FULL_AUTOPILOT_SCOPE: AutopilotScope = {
  reviews: true,
  comments: true,
  communication: true,
};

/**
 * The autopilot toggles, one Global -> Company -> Team override tree. Precedence
 * team > company > global; while autopilot is `off` all are false. Each key both starts
 * the work (`autoReview` / `autoAddressComments` / `autoImplement`) and lets the gate
 * overlay act on its outcome ({@link AUTOPILOT_SCOPE_TOGGLE}).
 */
export const AutomationTogglesSchema = z
  .object({
    autoReview: z.boolean(),
    autoAddressComments: z.boolean(),
    autoImplement: z.boolean(),
    // Default: trees written before communication joined the tree.
    autoCommunicate: z.boolean().default(false),
  })
  .strict();
export type AutomationToggles = z.infer<typeof AutomationTogglesSchema>;
export type AutomationKey = keyof AutomationToggles;

export const NO_AUTOMATION: AutomationToggles = {
  autoReview: false,
  autoAddressComments: false,
  autoImplement: false,
  autoCommunicate: false,
};

/** The tree key each gate-overlay class follows. */
export const AUTOPILOT_SCOPE_TOGGLE: Readonly<Record<AutopilotScopeKey, AutomationKey>> = {
  reviews: "autoReview",
  comments: "autoAddressComments",
  communication: "autoCommunicate",
};

/** A node's explicit choices; an absent key inherits from the level above. */
export const AutomationOverrideSchema = AutomationTogglesSchema.partial();
export type AutomationOverride = z.infer<typeof AutomationOverrideSchema>;

/** `companies` / `teams` are keyed by company id / team id. */
export const AutopilotAutomationSchema = z
  .object({
    global: AutomationTogglesSchema,
    companies: z.record(z.string(), AutomationOverrideSchema).default({}),
    teams: z.record(z.string(), AutomationOverrideSchema).default({}),
  })
  .strict();
export type AutopilotAutomation = z.infer<typeof AutopilotAutomationSchema>;

/** `autopilot.json` — the on-disk state. Absent / garbage reads as `{ level: "off" }`. */
export const AutopilotStateSchema = z
  .object({
    level: AutopilotLevelSchema,
    since: IsoDateTimeSchema.optional(),
    by: AutopilotActorSchema.optional(),
    scope: AutopilotScopeSchema.optional(),
    automation: AutopilotAutomationSchema.optional(),
  })
  .strict();
export type AutopilotState = z.infer<typeof AutopilotStateSchema>;

/** Where an action happens in the automation tree; empty = global. */
export const AutopilotLocationSchema = z
  .object({ companyId: z.string().min(1).optional(), teamId: z.string().min(1).optional() })
  .strict();
export type AutopilotLocation = z.infer<typeof AutopilotLocationSchema>;

/** Effective toggles at a company/team: `off` or no tree = all false, else global <- company <- team. */
export function resolveAutopilotAutomation(
  state: Pick<AutopilotState, "level" | "automation">,
  at: { companyId?: string | undefined; teamId?: string | undefined },
): AutomationToggles {
  if (state.level === "off" || !state.automation) return { ...NO_AUTOMATION };
  const { global, companies, teams } = state.automation;
  const company = at.companyId ? companies[at.companyId] : undefined;
  const team = at.teamId ? teams[at.teamId] : undefined;
  const out = { ...global };
  for (const node of [company, team]) {
    if (!node) continue;
    for (const k of Object.keys(out) as AutomationKey[]) {
      const v = node[k];
      if (v !== undefined) out[k] = v;
    }
  }
  return out;
}

/** `GET/PUT /api/autopilot` — the state plus how many approvals are still pending (never auto-decided). */
export const AutopilotStatusSchema = AutopilotStateSchema.extend({
  pendingApprovals: z.number().int().min(0),
});
export type AutopilotStatus = z.infer<typeof AutopilotStatusSchema>;

export const SetAutopilotInputSchema = z
  .object({
    level: AutopilotLevelSchema,
    /** Omitted = keep the stored tree. */
    automation: AutopilotAutomationSchema.optional(),
  })
  .strict();
export type SetAutopilotInput = z.infer<typeof SetAutopilotInputSchema>;
