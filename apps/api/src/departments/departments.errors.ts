/** Raised when no department in the registry matches the requested id. */
export class DepartmentNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`Department "${id}" not found`);
    this.name = "DepartmentNotFoundError";
  }
}

/** Raised by `create` when a department with the same id already exists (409). */
export class DepartmentConflictError extends Error {
  constructor(public readonly id: string) {
    super(`Department "${id}" already exists`);
    this.name = "DepartmentConflictError";
  }
}

/** Raised when a department/division id is malformed or would escape the data dir. */
export class InvalidDepartmentIdError extends Error {
  constructor(public readonly id: string) {
    super(`Invalid department id "${id}"`);
    this.name = "InvalidDepartmentIdError";
  }
}

/** Raised on create/update when `division` names no stored division (422). */
export class UnknownDivisionError extends Error {
  constructor(public readonly id: string) {
    super(`Unknown division "${id}"`);
    this.name = "UnknownDivisionError";
  }
}

/** The 422 a write boundary returns when a body names a department that does not exist (D-022). */
export const unknownDepartment422 = (id: string) =>
  ({ status: 422, body: { message: `Unknown department "${id}"` } }) as const;
