import { Inject, Injectable } from "@nestjs/common";
import { AGENT_ID_REGEX, type RoutingProposal, RoutingProposalSchema } from "@zibby/contracts";
import { EntityFileStore } from "../shared/file-storage";

/** DI token for the routing-proposals directory. */
export const ROUTING_PROPOSALS_DIR = "ROUTING_PROPOSALS_DIR";

export class RoutingProposalNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`Routing proposal "${id}" not found`);
    this.name = "RoutingProposalNotFoundError";
  }
}
export class InvalidRoutingProposalIdError extends Error {
  constructor(public readonly id: string) {
    super(`Invalid routing proposal id: "${id}"`);
    this.name = "InvalidRoutingProposalIdError";
  }
}

/**
 * NS2 F10 — the parked payload for a Tier-3 ROUTING handoff: one `<id>.json` per
 * proposal under `.zibby/data/roadmap/routing-proposals/`. A deliberate copy of
 * `HandoffProposalStore`'s shape (which itself mirrors the agent-factory candidate /
 * herald-graduation stores): a durable payload with no live child, write-once
 * (`RoadmapGateService`'s park path), read-once (`RoutingProposalService.resume`/
 * `cancel`), then removed either way — so there is no `update`.
 */
@Injectable()
export class RoutingProposalStore extends EntityFileStore<RoutingProposal> {
  protected readonly fileExt = ".json";
  protected readonly idRegex = AGENT_ID_REGEX;

  constructor(@Inject(ROUTING_PROPOSALS_DIR) dir: string) {
    super(dir);
  }

  async create(proposal: RoutingProposal): Promise<void> {
    await this.writeEntity(proposal);
  }

  protected idOf(proposal: RoutingProposal): string {
    return proposal.id;
  }

  protected serialize(proposal: RoutingProposal): string {
    return JSON.stringify(proposal);
  }

  protected tryParse(raw: string): RoutingProposal | null {
    return this.parseJson(RoutingProposalSchema, raw);
  }

  protected compare(a: RoutingProposal, b: RoutingProposal): number {
    return a.createdAt.localeCompare(b.createdAt);
  }

  protected notFound(id: string): Error {
    return new RoutingProposalNotFoundError(id);
  }

  protected invalidId(id: string): Error {
    return new InvalidRoutingProposalIdError(id);
  }
}
