// Public surface of the companies feature — its data layer. Other features
// import from here, not from companies/queries/* or companies/mutations/*
// internals. Never re-export Screen/DetailScreen (they would drag the whole
// view graph into every consumer and risk cycles) — mirrors features/projects.
export * from "./queries";
export * from "./mutations";
