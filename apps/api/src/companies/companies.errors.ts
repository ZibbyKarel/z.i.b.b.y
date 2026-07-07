/** Raised when a company does not exist for the requested id. */
export class CompanyNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`Company "${id}" not found`);
    this.name = "CompanyNotFoundError";
  }
}

/** Raised when creating a company whose id is already taken. */
export class CompanyConflictError extends Error {
  constructor(public readonly id: string) {
    super(`Company "${id}" already exists`);
    this.name = "CompanyConflictError";
  }
}
