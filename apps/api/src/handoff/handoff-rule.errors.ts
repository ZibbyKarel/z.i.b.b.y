/** A handoff rule id that does not resolve to a stored rule. */
export class HandoffRuleNotFoundError extends Error {
  constructor(id: string) {
    super(`Handoff rule "${id}" not found`);
    this.name = "HandoffRuleNotFoundError";
  }
}

/** A delete against a seeded system rule — system rules can be retuned, never deleted. */
export class SystemHandoffRuleError extends Error {
  constructor(id: string) {
    super(`Handoff rule "${id}" is a system rule and cannot be deleted`);
    this.name = "SystemHandoffRuleError";
  }
}
