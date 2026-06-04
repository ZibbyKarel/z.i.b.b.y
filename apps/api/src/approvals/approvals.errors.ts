/** Raised when no approval exists for the requested id. */
export class ApprovalNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`Approval "${id}" not found`)
    this.name = "ApprovalNotFoundError"
  }
}

/** Raised when deciding an approval that was already decided. */
export class ApprovalAlreadyDecidedError extends Error {
  constructor(public readonly id: string) {
    super(`Approval "${id}" has already been decided`)
    this.name = "ApprovalAlreadyDecidedError"
  }
}

/** Raised when an approval id is unsafe to use as a file name. */
export class InvalidApprovalIdError extends Error {
  constructor(public readonly id: string) {
    super(`Invalid approval id: "${id}"`)
    this.name = "InvalidApprovalIdError"
  }
}
