/** Raised when an agent file does not exist for the requested id. */
export class AgentNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`Agent "${id}" not found`)
    this.name = "AgentNotFoundError"
  }
}

/** Raised when creating an agent whose id is already taken. */
export class AgentConflictError extends Error {
  constructor(public readonly id: string) {
    super(`Agent "${id}" already exists`)
    this.name = "AgentConflictError"
  }
}

/** Raised when an id is unsafe to use as a file name (e.g. path traversal). */
export class InvalidAgentIdError extends Error {
  constructor(public readonly id: string) {
    super(`Invalid agent id: "${id}"`)
    this.name = "InvalidAgentIdError"
  }
}

/** Raised when an agent file exists but its contents cannot be parsed/validated. */
export class CorruptAgentFileError extends Error {
  constructor(public readonly id: string) {
    super(`Agent "${id}" is stored in a corrupt or invalid file`)
    this.name = "CorruptAgentFileError"
  }
}
