/** Raised when a roadmap item file does not exist for the requested (projectId, itemId). */
export class RoadmapItemNotFoundError extends Error {
  constructor(
    public readonly projectId: string,
    public readonly itemId: string,
  ) {
    super(`Roadmap item "${itemId}" not found for project "${projectId}"`);
    this.name = "RoadmapItemNotFoundError";
  }
}

/** Raised when creating a roadmap item whose id is already taken within its project. */
export class RoadmapItemConflictError extends Error {
  constructor(
    public readonly projectId: string,
    public readonly itemId: string,
  ) {
    super(`Roadmap item "${itemId}" already exists for project "${projectId}"`);
    this.name = "RoadmapItemConflictError";
  }
}

/**
 * Raised when a project id itself is unsafe to use as a directory name (e.g.
 * path traversal) — distinct from {@link InvalidRoadmapItemIdError} so a
 * malformed *project* id is never reported to a caller as "roadmap item not
 * found" (a project id has no item in the picture at all: `list()`,
 * `readConfig()` and `writeConfig()` never even reach an item id).
 */
export class InvalidRoadmapProjectIdError extends Error {
  constructor(public readonly projectId: string) {
    super(`Invalid roadmap project id: "${projectId}"`);
    this.name = "InvalidRoadmapProjectIdError";
  }
}

/** Raised when an itemId is unsafe to use as a file name (e.g. path traversal), under an otherwise-valid project. */
export class InvalidRoadmapItemIdError extends Error {
  constructor(
    public readonly projectId: string,
    public readonly itemId: string,
  ) {
    super(`Invalid roadmap item id: "${itemId}" (project "${projectId}")`);
    this.name = "InvalidRoadmapItemIdError";
  }
}

/**
 * Raised when a roadmap item file exists but its contents cannot be parsed
 * against `RoadmapItemSchema` — data corruption, not absence. Deliberately
 * kept distinct from {@link RoadmapItemNotFoundError} and NOT folded into the
 * controller's 404 `missing` mapping: collapsing it into "not found" would
 * silently hide real data loss behind an ordinary, everyday 404 (a legitimate
 * state every list/board view has to handle anyway). Left unmapped, it
 * surfaces as an unhandled exception (a 500) — a loud signal that something
 * on disk is actually broken, distinct from the item simply not existing.
 * `list()` stays tolerant of the same condition on purpose (skips the file
 * rather than failing the whole listing); this error is only ever thrown from
 * `get()` (and transitively `update()`, which reads via `get()`), where a
 * SPECIFIC item was asked for and silently returning "not found" would erase
 * the fact that its file is actually still there, just broken.
 */
export class CorruptRoadmapItemFileError extends Error {
  constructor(
    public readonly projectId: string,
    public readonly itemId: string,
  ) {
    super(
      `Roadmap item "${itemId}" for project "${projectId}" is stored in a corrupt or invalid file`,
    );
    this.name = "CorruptRoadmapItemFileError";
  }
}

/**
 * Raised by {@link RoadmapGateService}'s play/override/restart/resume actions when
 * an item's CURRENT `lifecycle` doesn't permit the requested action (e.g. `play` on
 * anything but `todo`, `restart`/`resume` on anything but `failed`, `resume` with no
 * resumable run on its last run record). Mapped to 409 in the controller — distinct
 * from {@link RoadmapItemConflictError} (409 on a duplicate CREATE), because this is
 * a state-machine violation, not an id collision.
 */
export class RoadmapItemLifecycleError extends Error {
  constructor(
    public readonly projectId: string,
    public readonly itemId: string,
    reason: string,
  ) {
    super(`Roadmap item "${itemId}" (project "${projectId}") ${reason}`);
    this.name = "RoadmapItemLifecycleError";
  }
}
