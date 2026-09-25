/** Raised when no employee exists for the requested id. */
export class EmployeeNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`Employee "${id}" not found`);
    this.name = "EmployeeNotFoundError";
  }
}

/** Raised when an employee id is malformed or would escape the data directory. */
export class InvalidEmployeeIdError extends Error {
  constructor(public readonly id: string) {
    super(`Invalid employee id "${id}"`);
    this.name = "InvalidEmployeeIdError";
  }
}

/** Raised when hiring/moving into a department id outside the closed registry. */
export class EmployeeDepartmentNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`Department "${id}" not found`);
    this.name = "EmployeeDepartmentNotFoundError";
  }
}

/** Raised when firing (or otherwise mutating) an employee that holds a leased run. */
export class EmployeeLeasedError extends Error {
  constructor(public readonly id: string) {
    super(`Employee "${id}" holds a leased run`);
    this.name = "EmployeeLeasedError";
  }
}

/** Raised when a name pool entry does not exist for the requested id. */
export class EmployeeNameNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`Employee name "${id}" not found`);
    this.name = "EmployeeNameNotFoundError";
  }
}

/** Raised when creating a name pool entry whose name is already taken. */
export class EmployeeNameConflictError extends Error {
  constructor(public readonly name: string) {
    super(`Employee name "${name}" already exists`);
    this.name = "EmployeeNameConflictError";
  }
}

/** Raised when deleting/reassigning a pool entry held by an active employee. */
export class EmployeeNameInUseError extends Error {
  constructor(public readonly name: string) {
    super(`Employee name "${name}" is in use`);
    this.name = "EmployeeNameInUseError";
  }
}

/**
 * Raised on hire/rename when a requested pool name doesn't exist or is already
 * taken. Both collapse to the same 409 — from the caller's point of view a named
 * pool entry it can hire/rename into isn't available either way.
 */
export class EmployeeNameUnavailableError extends Error {
  constructor(public readonly name: string) {
    super(`Employee name "${name}" is not available`);
    this.name = "EmployeeNameUnavailableError";
  }
}

/** Raised on hire when the name pool has no free entries and none was requested. */
export class EmployeeNamePoolEmptyError extends Error {
  constructor() {
    super("The employee name pool has no free names");
    this.name = "EmployeeNamePoolEmptyError";
  }
}

/**
 * Raised by `EmployeeAllocator.acquire` when a department owns no active employee
 * of the requested position at all (as opposed to "all busy", which waits FIFO
 * instead of throwing).
 */
export class NoEmployeeError extends Error {
  constructor(
    public readonly department: string,
    public readonly agentId: string,
  ) {
    super(`Department "${department}" has no employee of position "${agentId}"`);
    this.name = "NoEmployeeError";
  }
}
