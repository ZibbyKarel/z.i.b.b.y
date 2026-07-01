import { Inject, Injectable } from "@nestjs/common";
import { AGENT_ID_REGEX, type Chain, ChainSchema, type CreateChainInput } from "@zibby/contracts";
import { EntityFileStore } from "../shared/file-storage";

export const CHAINS_DIR = "CHAINS_DIR";

export class ChainNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`Chain "${id}" not found`);
    this.name = "ChainNotFoundError";
  }
}
export class ChainConflictError extends Error {
  constructor(public readonly id: string) {
    super(`Chain "${id}" already exists`);
    this.name = "ChainConflictError";
  }
}
export class InvalidChainIdError extends Error {
  constructor(public readonly id: string) {
    super(`Invalid chain id: "${id}"`);
    this.name = "InvalidChainIdError";
  }
}

/**
 * File-backed persistence for chain definitions (N2b) — one `<id>.json` each.
 * A chain is the operator's composition (north-star: composition is the
 * operator's to author), so it is a durable, human-readable file like every
 * other definition; runs live with the {@link ChainRunnerService}.
 */
@Injectable()
export class ChainsStorageService extends EntityFileStore<Chain> {
  protected readonly fileExt = ".json";
  protected readonly idRegex = AGENT_ID_REGEX;

  constructor(@Inject(CHAINS_DIR) dir: string) {
    super(dir);
  }

  protected idOf(chain: Chain): string {
    return chain.id;
  }

  protected serialize(chain: Chain): string {
    return `${JSON.stringify(chain, null, 2)}\n`;
  }

  protected tryParse(raw: string): Chain | null {
    return this.parseJson(ChainSchema, raw);
  }

  protected compare(a: Chain, b: Chain): number {
    return a.id.localeCompare(b.id);
  }

  protected notFound(id: string): Error {
    return new ChainNotFoundError(id);
  }

  protected invalidId(id: string): Error {
    return new InvalidChainIdError(id);
  }

  async create(input: CreateChainInput): Promise<Chain> {
    const file = this.resolveFile(input.id);
    if (await this.fileExists(file)) throw new ChainConflictError(input.id);
    await this.writeEntity(input);
    return input;
  }
}
