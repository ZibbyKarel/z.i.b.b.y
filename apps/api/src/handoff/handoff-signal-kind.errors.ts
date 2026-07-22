/** A handoff signal-kind id that does not resolve to a stored kind. */
export class SignalKindNotFoundError extends Error {
  constructor(id: string) {
    super(`Handoff signal kind "${id}" not found`);
    this.name = "SignalKindNotFoundError";
  }
}

/** An update/delete against a seeded built-in signal kind — built-ins are view-only. */
export class SystemSignalKindError extends Error {
  constructor(id: string) {
    super(`Handoff signal kind "${id}" is a built-in and cannot be modified or deleted`);
    this.name = "SystemSignalKindError";
  }
}
