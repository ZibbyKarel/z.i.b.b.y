/** Raised when creating a category whose name is already taken. */
export class CategoryConflictError extends Error {
  constructor(public readonly name: string) {
    super(`Category "${name}" already exists`)
    this.name = "CategoryConflictError"
  }
}

/** Raised when a category to delete does not exist in the manifest. */
export class CategoryNotFoundError extends Error {
  constructor(public readonly name: string) {
    super(`Category "${name}" not found`)
    this.name = "CategoryNotFoundError"
  }
}

/** Raised when deleting a category that still has agents filed under it. */
export class CategoryNotEmptyError extends Error {
  constructor(
    public readonly name: string,
    public readonly count: number,
  ) {
    super(`Category "${name}" still has ${count} agent(s) and cannot be deleted`)
    this.name = "CategoryNotEmptyError"
  }
}
