/** Raised when a pipeline file does not exist for the requested id. */
export class PipelineNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`Pipeline "${id}" not found`);
    this.name = "PipelineNotFoundError";
  }
}

/** Raised when creating a pipeline whose id is already taken. */
export class PipelineConflictError extends Error {
  constructor(public readonly id: string) {
    super(`Pipeline "${id}" already exists`);
    this.name = "PipelineConflictError";
  }
}

/** Raised when an id is unsafe to use as a file name (e.g. path traversal). */
export class InvalidPipelineIdError extends Error {
  constructor(public readonly id: string) {
    super(`Invalid pipeline id: "${id}"`);
    this.name = "InvalidPipelineIdError";
  }
}

/** Raised when a pipeline file exists but its contents cannot be parsed/validated. */
export class CorruptPipelineFileError extends Error {
  constructor(public readonly id: string) {
    super(`Pipeline "${id}" is stored in a corrupt or invalid file`);
    this.name = "CorruptPipelineFileError";
  }
}

/** Raised when a pipeline definition is structurally invalid (e.g. bad loop target). */
export class InvalidPipelineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidPipelineError";
  }
}
