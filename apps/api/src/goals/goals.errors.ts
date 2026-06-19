/** Raised when a goal file does not exist for the requested id. */
export class GoalNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`Goal "${id}" not found`);
    this.name = "GoalNotFoundError";
  }
}

/** Raised when creating a goal whose id is already taken. */
export class GoalConflictError extends Error {
  constructor(public readonly id: string) {
    super(`Goal "${id}" already exists`);
    this.name = "GoalConflictError";
  }
}

/** Raised when an id is unsafe to use as a file name (e.g. path traversal). */
export class InvalidGoalIdError extends Error {
  constructor(public readonly id: string) {
    super(`Invalid goal id: "${id}"`);
    this.name = "InvalidGoalIdError";
  }
}

/** Raised when a goal file exists but its contents cannot be parsed/validated. */
export class CorruptGoalFileError extends Error {
  constructor(public readonly id: string) {
    super(`Goal "${id}" is stored in a corrupt or invalid file`);
    this.name = "CorruptGoalFileError";
  }
}

/** Raised when a goal definition is structurally invalid (e.g. bad verifier spec). */
export class InvalidGoalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidGoalError";
  }
}

/** Raised when a goal run id is unknown — controllers map it to a 404. */
export class GoalRunNotFoundError extends Error {
  constructor(id: string) {
    super(`Goal run "${id}" not found`);
    this.name = "GoalRunNotFoundError";
  }
}

/**
 * Raised when resume-with-note targets a run that is not parked — controllers map
 * it to a 409. A running / paused-limit goal resumes only through its own machine.
 */
export class GoalRunNotParkedError extends Error {
  constructor(id: string) {
    super(`Goal run "${id}" is not parked`);
    this.name = "GoalRunNotParkedError";
  }
}
