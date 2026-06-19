/** A catalog rule id that does not resolve to a stored rule. */
export class GateRuleNotFoundError extends Error {
  constructor(id: string) {
    super(`Gate rule "${id}" not found`);
    this.name = "GateRuleNotFoundError";
  }
}

/** A catalog rule id that fails the filename-safe id rule (defense in depth). */
export class InvalidGateRuleIdError extends Error {
  constructor(id: string) {
    super(`Invalid gate rule id "${id}"`);
    this.name = "InvalidGateRuleIdError";
  }
}
