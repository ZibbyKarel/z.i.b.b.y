// Public surface of the system feature — its data layer. Other features import
// from here, not from system/queries/* or system/mutations/* internals. Never re-export
// Screen (it would drag the whole view graph into every consumer and risk cycles).
export * from "./queries";
export * from "./mutations";
