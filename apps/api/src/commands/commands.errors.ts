/** Raised when a command file does not exist for the requested id. */
export class CommandNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`Command "${id}" not found`)
    this.name = "CommandNotFoundError"
  }
}

/** Raised when creating a command whose id is already taken. */
export class CommandConflictError extends Error {
  constructor(public readonly id: string) {
    super(`Command "${id}" already exists`)
    this.name = "CommandConflictError"
  }
}

/** Raised when an id is unsafe to use as a file name (e.g. path traversal). */
export class InvalidCommandIdError extends Error {
  constructor(public readonly id: string) {
    super(`Invalid command id: "${id}"`)
    this.name = "InvalidCommandIdError"
  }
}

/** Raised when a command file exists but its contents cannot be parsed/validated. */
export class CorruptCommandFileError extends Error {
  constructor(public readonly id: string) {
    super(`Command "${id}" is stored in a corrupt or invalid file`)
    this.name = "CorruptCommandFileError"
  }
}
