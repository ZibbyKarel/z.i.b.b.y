/** Raised when a workflow file does not exist for the requested id. */
export class WorkflowNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`Workflow "${id}" not found`);
    this.name = "WorkflowNotFoundError";
  }
}

/** Raised when creating a workflow whose id is already taken. */
export class WorkflowConflictError extends Error {
  constructor(public readonly id: string) {
    super(`Workflow "${id}" already exists`);
    this.name = "WorkflowConflictError";
  }
}

/** Raised when an id is unsafe to use as a file name (e.g. path traversal). */
export class InvalidWorkflowIdError extends Error {
  constructor(public readonly id: string) {
    super(`Invalid workflow id: "${id}"`);
    this.name = "InvalidWorkflowIdError";
  }
}

/** Raised when a workflow file exists but its contents cannot be parsed/validated. */
export class CorruptWorkflowFileError extends Error {
  constructor(public readonly id: string) {
    super(`Workflow "${id}" is stored in a corrupt or invalid file`);
    this.name = "CorruptWorkflowFileError";
  }
}

/** Raised when a workflow definition is structurally invalid (e.g. bad loop target). */
export class InvalidWorkflowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidWorkflowError";
  }
}
