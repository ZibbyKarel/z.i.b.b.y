// Public surface of the goals feature — its data layer. Other features import
// from here, not from goals/queries/* or goals/mutations/* internals. Never re-export
// Screen (it would drag the whole view graph into every consumer and risk cycles).
export * from "./queries";
export * from "./mutations";
