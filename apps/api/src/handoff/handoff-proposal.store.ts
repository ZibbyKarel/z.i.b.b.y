import { Inject, Injectable } from "@nestjs/common";
import { AGENT_ID_REGEX, type HandoffProposal, HandoffProposalSchema } from "@zibby/contracts";
import { EntityFileStore } from "../shared/file-storage";

/** DI token for the proposals directory. */
export const HANDOFF_PROPOSALS_DIR = "HANDOFF_PROPOSALS_DIR";

export class HandoffProposalNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`Handoff proposal "${id}" not found`);
    this.name = "HandoffProposalNotFoundError";
  }
}
export class InvalidHandoffProposalIdError extends Error {
  constructor(public readonly id: string) {
    super(`Invalid handoff proposal id: "${id}"`);
    this.name = "InvalidHandoffProposalIdError";
  }
}

/**
 * A2 — the parked payload for a Tier-3 handoff (design doc Part A.2): one
 * `<id>.json` per proposal under `.zibby/data/handoff/proposals/`, mirroring the
 * agent-factory candidate / herald-graduation "durable payload, no live child"
 * store shape. Write-once (`HandoffService.evaluate`'s propose path), read-once
 * (`resume`/`cancel`), then removed either way — no `update`.
 */
@Injectable()
export class HandoffProposalStore extends EntityFileStore<HandoffProposal> {
  protected readonly fileExt = ".json";
  protected readonly idRegex = AGENT_ID_REGEX;

  constructor(@Inject(HANDOFF_PROPOSALS_DIR) dir: string) {
    super(dir);
  }

  async create(proposal: HandoffProposal): Promise<void> {
    await this.writeEntity(proposal);
  }

  protected idOf(proposal: HandoffProposal): string {
    return proposal.id;
  }

  protected serialize(proposal: HandoffProposal): string {
    return JSON.stringify(proposal);
  }

  protected tryParse(raw: string): HandoffProposal | null {
    return this.parseJson(HandoffProposalSchema, raw);
  }

  protected compare(a: HandoffProposal, b: HandoffProposal): number {
    return a.createdAt.localeCompare(b.createdAt);
  }

  protected notFound(id: string): Error {
    return new HandoffProposalNotFoundError(id);
  }

  protected invalidId(id: string): Error {
    return new InvalidHandoffProposalIdError(id);
  }
}
