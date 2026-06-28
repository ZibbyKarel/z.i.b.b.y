import { Inject, Injectable } from "@nestjs/common";
import { type Approval, ApprovalSchema } from "@zibby/contracts";
import { EntityFileStore, collisionResistantId, safeJson } from "../shared/file-storage";
import { ApprovalNotFoundError, InvalidApprovalIdError } from "./approvals.errors";

/** DI token carrying the absolute path of the directory that holds approval files. */
export const APPROVALS_DIR = "APPROVALS_DIR";

const ID_REGEX = /^[a-zA-Z0-9._-]+$/;

/**
 * Durable, file-backed persistence for approvals: one `<id>.json` per approval in
 * a configurable directory. An approval must outlive both a polling gap and a
 * backend restart, so it is persisted the same atomic-write / tolerant-parse way
 * as run sidecars — a single corrupt file is skipped, never fatal to the list.
 */
@Injectable()
export class ApprovalsStorageService extends EntityFileStore<Approval> {
  protected readonly fileExt = ".json";
  protected readonly idRegex = ID_REGEX;

  constructor(@Inject(APPROVALS_DIR) dir: string) {
    super(dir);
  }

  async create(approval: Approval): Promise<Approval> {
    await this.writeEntity(approval);
    return approval;
  }

  async update(approval: Approval): Promise<Approval> {
    await this.writeEntity(approval);
    return approval;
  }

  /** A fresh, filename-safe, collision-resistant approval id. */
  newId(prefix: string): string {
    return collisionResistantId(prefix);
  }

  protected idOf(approval: Approval): string {
    return approval.id;
  }

  protected serialize(approval: Approval): string {
    return JSON.stringify(approval);
  }

  protected tryParse(raw: string): Approval | null {
    const parsed = ApprovalSchema.safeParse(safeJson(raw));
    return parsed.success ? parsed.data : null;
  }

  protected compare(a: Approval, b: Approval): number {
    return a.requestedAt.localeCompare(b.requestedAt);
  }

  protected notFound(id: string): Error {
    return new ApprovalNotFoundError(id);
  }

  protected invalidId(id: string): Error {
    return new InvalidApprovalIdError(id);
  }
}
