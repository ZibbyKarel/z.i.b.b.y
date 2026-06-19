import { z } from "zod";

/** Per-channel autonomy switches; absent fields fall back to the defaults. */
export const MandateChannelSchema = z
  .object({
    dispatch: z.boolean().optional(),
    reply: z.boolean().optional(),
  })
  .strict();
export type MandateChannel = z.infer<typeof MandateChannelSchema>;

/**
 * The autonomy mandate (Phase 5.3): what ZIBBY may do unprompted per channel.
 * Conservative by default — `dispatch: true` so Tier-1 investigation works out of
 * the box, but `reply: false` so NO outbound reply leaves without the operator
 * opting in per channel. `.strict()` at every level (Law 4): a channel item can
 * never write this; only the operator's PUT /api/mandate can.
 */
export const MandateSchema = z
  .object({
    defaults: z
      .object({
        dispatch: z.boolean(),
        reply: z.boolean(),
      })
      .strict(),
    channels: z.record(z.string(), MandateChannelSchema).default({}),
  })
  .strict();
export type Mandate = z.infer<typeof MandateSchema>;

/**
 * Transport schema for `PUT /api/mandate`. Deliberately `.passthrough()` at every
 * level so an unknown key REACHES the handler (a non-strict zod would silently
 * strip it, a strict one would be a generic 400 at the ts-rest boundary). The
 * handler then strict-validates against {@link MandateSchema} and returns a precise
 * 422 — so "reject unknown keys" is an explicit, testable contract, not a side
 * effect of transport validation.
 */
export const MandateWriteSchema = z
  .object({
    defaults: z.object({ dispatch: z.boolean(), reply: z.boolean() }).passthrough(),
    channels: z
      .record(
        z.string(),
        z.object({ dispatch: z.boolean().optional(), reply: z.boolean().optional() }).passthrough(),
      )
      .optional(),
  })
  .passthrough();

/** The seeded floor: dispatch on, reply off (operator opts in per channel). */
export const DEFAULT_MANDATE: Mandate = {
  defaults: { dispatch: true, reply: false },
  channels: {},
};
