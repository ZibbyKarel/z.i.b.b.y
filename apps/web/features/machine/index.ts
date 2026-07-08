// Public surface of the machine feature — its data layer (THIS machine's
// per-machine config, Phase 76/77). Other features import from here, not from
// machine/queries/* or machine/mutations/* internals.
export * from "./queries";
export * from "./mutations";
