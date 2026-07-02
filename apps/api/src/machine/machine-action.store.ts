import { Inject, Injectable } from "@nestjs/common";
import { type MachineActionRecord, MachineActionRecordSchema } from "@zibby/contracts";
import { EntityFileStore } from "../shared/file-storage";

export const MACHINE_ACTIONS_DIR = "MACHINE_ACTIONS_DIR";

/** Record ids are server-minted (`machine-<epoch>-<rand>`). */
const ACTION_ID_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

export class MachineActionNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`Machine action "${id}" not found`);
    this.name = "MachineActionNotFoundError";
  }
}
export class InvalidMachineActionIdError extends Error {
  constructor(public readonly id: string) {
    super(`Invalid machine action id: "${id}"`);
    this.name = "InvalidMachineActionIdError";
  }
}

/**
 * File-backed machine action records (N5a) — one `<id>.json` per action. The
 * durable gate state: unlike the in-memory jira-issue map, a restart keeps a
 * parked action resumable, and the persisted preview doubles as the old→new
 * audit map after execution (reversible-by-default).
 */
@Injectable()
export class MachineActionStore extends EntityFileStore<MachineActionRecord> {
  protected readonly fileExt = ".json";
  protected readonly idRegex = ACTION_ID_REGEX;

  constructor(@Inject(MACHINE_ACTIONS_DIR) dir: string) {
    super(dir);
  }

  protected idOf(record: MachineActionRecord): string {
    return record.id;
  }

  protected serialize(record: MachineActionRecord): string {
    return `${JSON.stringify(record, null, 2)}\n`;
  }

  protected tryParse(raw: string): MachineActionRecord | null {
    return this.parseJson(MachineActionRecordSchema, raw);
  }

  protected compare(a: MachineActionRecord, b: MachineActionRecord): number {
    return b.requestedAt.localeCompare(a.requestedAt);
  }

  protected notFound(id: string): Error {
    return new MachineActionNotFoundError(id);
  }

  protected invalidId(id: string): Error {
    return new InvalidMachineActionIdError(id);
  }

  async put(record: MachineActionRecord): Promise<MachineActionRecord> {
    await this.writeEntity(record);
    return record;
  }
}
