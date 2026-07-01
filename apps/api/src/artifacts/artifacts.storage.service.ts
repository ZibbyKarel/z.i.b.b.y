import { Inject, Injectable } from "@nestjs/common";
import {
  type ArtifactKind,
  type ArtifactListQuery,
  type ArtifactRecord,
  ArtifactRecordSchema,
} from "@zibby/contracts";
import { EntityFileStore } from "../shared/file-storage";

export const ARTIFACTS_DIR = "ARTIFACTS_DIR";

/** Record ids are derived (`<runRef>_<kind>_<slug(from)>`) — same charset as run refs. */
const ARTIFACT_ID_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

export class ArtifactNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`Artifact "${id}" not found`);
    this.name = "ArtifactNotFoundError";
  }
}
export class InvalidArtifactIdError extends Error {
  constructor(public readonly id: string) {
    super(`Invalid artifact id: "${id}"`);
    this.name = "InvalidArtifactIdError";
  }
}

/**
 * Derive the stable record id for one delivered artifact. Stable per
 * (run, sink kind, handoff name), so an idempotent re-delivery of the same run
 * REPLACES its record instead of duplicating it, while a `pr` and a `file` sink
 * drawing from the same handoff keep distinct records.
 */
export function artifactRecordId(runRef: string, kind: ArtifactKind, from: string): string {
  const slug = from
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${runRef}_${kind}_${slug || "artifact"}`;
}

/**
 * The durable artifact registry (N2a) — one plain-JSON provenance record per
 * delivered output, written by the pipeline delivery sinks at delivery time.
 * Files are the source of truth: the registry is what lets a chain (N2b) bind a
 * downstream pipeline's input to an upstream run's output long after that run is
 * evicted from memory, and what makes "where did this file/PR come from?" always
 * answerable (Law 5).
 */
@Injectable()
export class ArtifactsStorageService extends EntityFileStore<ArtifactRecord> {
  protected readonly fileExt = ".json";
  protected readonly idRegex = ARTIFACT_ID_REGEX;

  constructor(@Inject(ARTIFACTS_DIR) dir: string) {
    super(dir);
  }

  protected idOf(record: ArtifactRecord): string {
    return record.id;
  }

  protected serialize(record: ArtifactRecord): string {
    return `${JSON.stringify(record, null, 2)}\n`;
  }

  protected tryParse(raw: string): ArtifactRecord | null {
    return this.parseJson(ArtifactRecordSchema, raw);
  }

  /** Newest-first — the registry reads as a delivery log. */
  protected compare(a: ArtifactRecord, b: ArtifactRecord): number {
    return b.createdAt.localeCompare(a.createdAt);
  }

  protected notFound(id: string): Error {
    return new ArtifactNotFoundError(id);
  }

  protected invalidId(id: string): Error {
    return new InvalidArtifactIdError(id);
  }

  /** Persist one record; same id replaces (idempotent re-delivery). */
  async record(record: ArtifactRecord): Promise<void> {
    await this.writeEntity(record);
  }

  /** List records newest-first, optionally scoped to a project and/or pipeline. */
  async listFiltered(query: ArtifactListQuery = {}): Promise<ArtifactRecord[]> {
    const all = await this.list();
    return all.filter(
      (r) =>
        (!query.projectId || r.producedBy.projectId === query.projectId) &&
        (!query.pipelineId || r.producedBy.pipelineId === query.pipelineId),
    );
  }
}
