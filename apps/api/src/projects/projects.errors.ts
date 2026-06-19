/** Raised when a project does not exist for the requested id. */
export class ProjectNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`Project "${id}" not found`);
    this.name = "ProjectNotFoundError";
  }
}

/** Raised when creating a project whose id is already taken. */
export class ProjectConflictError extends Error {
  constructor(public readonly id: string) {
    super(`Project "${id}" already exists`);
    this.name = "ProjectConflictError";
  }
}
