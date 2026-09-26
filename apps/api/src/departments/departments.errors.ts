/** Raised when no department in the registry matches the requested id. */
export class DepartmentNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`Department "${id}" not found`);
    this.name = "DepartmentNotFoundError";
  }
}
