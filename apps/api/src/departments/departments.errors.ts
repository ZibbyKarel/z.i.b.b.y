/** Raised when no subsystem in the registry matches the requested id. */
export class SubsystemNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`Subsystem "${id}" not found`);
    this.name = "SubsystemNotFoundError";
  }
}
