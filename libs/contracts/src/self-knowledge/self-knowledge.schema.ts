import { z } from "zod";
import { IsoDateTimeSchema } from "../common.schema";

/**
 * How many entities of each kind fed the last compose — a cheap at-a-glance
 * summary for the UI badge/panel, without parsing the markdown.
 */
export const SelfKnowledgeSectionsSchema = z.object({
  agents: z.number().int().nonnegative(),
  pipelines: z.number().int().nonnegative(),
  /** System floor rules + the global gate-rule catalog, combined. */
  gateRules: z.number().int().nonnegative(),
  channels: z.number().int().nonnegative(),
  /** Static subsystem identities (`@zibby/contracts` `SUBSYSTEMS`) — count only. */
  subsystems: z.number().int().nonnegative(),
  /**
   * Codebase-shape digest sourced from graphify's `graphify-out/GRAPH_REPORT.md`
   * (Fáze 10 — see `docs/plans/phase-10-graphify-self-knowledge.md`). `present`
   * is false when `graphify-out/` was missing or unreadable at compose time, in
   * which case `godNodes`/`communities` are both `0`. Optional so payloads
   * composed before this section existed still validate — absent means "not
   * yet reported", not "empty".
   */
  codebaseShape: z
    .object({
      present: z.boolean(),
      godNodes: z.number().int().nonnegative(),
      communities: z.number().int().nonnegative(),
    })
    .optional(),
});
export type SelfKnowledgeSections = z.infer<typeof SelfKnowledgeSectionsSchema>;

/**
 * The machine-generated self-knowledge payload (Fáze 1): a Markdown snapshot of
 * ZIBBY's own agents/pipelines/gate rules/channels, plus whether the vault note
 * has drifted from what a fresh compose would produce right now. `markdown` is
 * the full note body (AUTO blocks + any operator content already merged);
 * `drift` compares only the AUTO blocks (the `META` timestamp block is excluded
 * from that comparison, since it always differs run to run).
 */
export const SelfKnowledgeSchema = z.object({
  markdown: z.string(),
  generatedAt: IsoDateTimeSchema,
  drift: z.boolean(),
  sections: SelfKnowledgeSectionsSchema,
});
export type SelfKnowledge = z.infer<typeof SelfKnowledgeSchema>;
