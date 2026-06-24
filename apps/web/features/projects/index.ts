// Public surface of the projects feature — its data layer. Other features import
// from here, not from projects/queries/* or projects/mutations/* internals. Never re-export
// Screen (it would drag the whole view graph into every consumer and risk cycles).
export * from "./queries";
export * from "./mutations";
