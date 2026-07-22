// Public surface of the handoff feature — its data layer. Other features import
// from here, not from handoff/queries/* or handoff/mutations/* internals. Never
// re-export components (it would drag the whole view graph into every consumer
// and risk cycles) — mirrors the gates/pipelines feature barrels.
export * from "./queries";
export * from "./mutations";
