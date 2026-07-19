import type { Briefing } from "@zibby/contracts";

/**
 * F8a (O6) — the no-cycle seam for {@link BriefingService.generate} to announce a
 * freshly generated briefing into the chat transcript as a message. `BriefingModule`
 * cannot import `ChatModule` to ask it directly — `ChatModule` already imports
 * `BriefingModule` the other way (the `get_status` MCP tool reads `BriefingService`),
 * so importing back would cycle. Instead `BriefingService` accepts any number of
 * `BriefingTranscriptSink`s via this DI token, mirroring
 * `tasks/attachment-set-ref-provider.ts`'s exact shape for the same problem. See
 * `briefing-transcript-sink.module.ts` for how the chat-side implementation is wired
 * in without either module importing the other.
 */
export const BRIEFING_TRANSCRIPT_SINK = "BRIEFING_TRANSCRIPT_SINK";

/** One contributor announcing a freshly generated briefing somewhere. May throw —
 *  `BriefingService.generate` wraps each call in `.catch` so a sink failure never
 *  blocks the vault-note/activity outcome, which stays the durable result. */
export interface BriefingTranscriptSink {
  announce(briefing: Briefing): Promise<void>;
}
