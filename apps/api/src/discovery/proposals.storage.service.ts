import { Inject, Injectable } from "@nestjs/common";
import { type Proposal, ProposalSchema } from "@zibby/contracts";
import { EntityFileStore, collisionResistantId } from "../shared/file-storage";

/** DI token carrying the absolute path of the directory that holds proposal files. */
export const PROPOSALS_DIR = "PROPOSALS_DIR";

const ID_REGEX = /^[a-zA-Z0-9._-]+$/;

/** Raised when a proposal id is unknown. */
export class ProposalNotFoundError extends Error {
  constructor(id: string) {
    super(`Proposal "${id}" not found`);
    this.name = "ProposalNotFoundError";
  }
}

/** Raised when a proposal id is unsafe to use as a file name. */
export class InvalidProposalIdError extends Error {
  constructor(id: string) {
    super(`Invalid proposal id: "${id}"`);
    this.name = "InvalidProposalIdError";
  }
}

/**
 * File-backed persistence for discovery proposals: one `<id>.json` per proposal.
 * A proposal must survive a restart while it waits in the gate, so it persists the
 * same atomic-write / tolerant-parse way as approval/run sidecars.
 */
@Injectable()
export class ProposalsStorageService extends EntityFileStore<Proposal> {
  protected readonly fileExt = ".json";
  protected readonly idRegex = ID_REGEX;

  constructor(@Inject(PROPOSALS_DIR) dir: string) {
    super(dir);
  }

  async create(proposal: Proposal): Promise<Proposal> {
    await this.writeEntity(proposal);
    return proposal;
  }

  async update(proposal: Proposal): Promise<Proposal> {
    await this.writeEntity(proposal);
    return proposal;
  }

  /** A fresh, filename-safe, collision-resistant proposal id. */
  newId(): string {
    return collisionResistantId("proposal");
  }

  protected idOf(proposal: Proposal): string {
    return proposal.id;
  }

  protected serialize(proposal: Proposal): string {
    return JSON.stringify(proposal);
  }

  protected tryParse(raw: string): Proposal | null {
    return this.parseJson(ProposalSchema, raw);
  }

  protected compare(a: Proposal, b: Proposal): number {
    return a.createdAt.localeCompare(b.createdAt);
  }

  protected notFound(id: string): Error {
    return new ProposalNotFoundError(id);
  }

  protected invalidId(id: string): Error {
    return new InvalidProposalIdError(id);
  }
}
