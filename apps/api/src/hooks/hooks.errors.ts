/** Raised when a hook file does not exist for the requested id. */
export class HookNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`Hook "${id}" not found`);
    this.name = "HookNotFoundError";
  }
}

/** Raised when creating a hook whose id is already taken. */
export class HookConflictError extends Error {
  constructor(public readonly id: string) {
    super(`Hook "${id}" already exists`);
    this.name = "HookConflictError";
  }
}

/** Raised when an id is unsafe to use as a file name (e.g. path traversal). */
export class InvalidHookIdError extends Error {
  constructor(public readonly id: string) {
    super(`Invalid hook id: "${id}"`);
    this.name = "InvalidHookIdError";
  }
}
