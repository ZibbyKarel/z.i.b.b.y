/**
 * The seam `ChannelTriageFlowService` resolves the reply-draft sweeper through.
 *
 * The dependency genuinely runs both ways — the sweeper calls the flow's
 * `parkOrSurface()` after research, and the flow's `sweepDrafts()` (what the
 * watcher tick calls) has to reach the sweeper. Exposing the seam as a token +
 * interface, rather than the concrete class, keeps the *import* graph one-way:
 * the sweeper imports the flow, the flow imports only this file. So the lazy
 * `ModuleRef` resolution below never re-enters a half-initialized module.
 */
export interface ReplyDraftSweeper {
  /** One pass over the `needs-draft` backlog. Never throws. */
  sweep(): Promise<void>;
}

export const REPLY_DRAFT_SWEEPER = Symbol("REPLY_DRAFT_SWEEPER");
