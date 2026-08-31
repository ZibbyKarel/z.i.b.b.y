// Public surface of the teams feature — its data layer. Other features import
// from here, not from teams/queries/* or teams/mutations/* internals. Never
// re-export Screen/DetailScreen (they would drag the whole view graph into
// every consumer and risk cycles) — mirrors features/companies.
export * from "./queries";
export * from "./mutations";
