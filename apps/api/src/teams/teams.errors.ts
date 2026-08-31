/** Raised when a team does not exist for the requested id. */
export class TeamNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`Team "${id}" not found`);
    this.name = "TeamNotFoundError";
  }
}

/** Raised when creating a team whose id is already taken. */
export class TeamConflictError extends Error {
  constructor(public readonly id: string) {
    super(`Team "${id}" already exists`);
    this.name = "TeamConflictError";
  }
}
