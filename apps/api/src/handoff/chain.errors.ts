/** ZB-05a — thrown when a chain id names nothing (or names a non-chain signal kind). */
export class ChainNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`Chain "${id}" not found`);
    this.name = "ChainNotFoundError";
  }
}

/** ZB-05a — thrown when a `PUT` chain input fails `validateChainInput` (400). */
export class InvalidChainInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidChainInputError";
  }
}

/** ZB-05a — thrown when `DELETE` is refused: a non-terminal parent task still references it (409). */
export class ChainInUseError extends Error {
  constructor(public readonly id: string) {
    super(`Chain "${id}" is still in use by an active task`);
    this.name = "ChainInUseError";
  }
}
