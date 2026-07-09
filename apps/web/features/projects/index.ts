// Public surface of the projects feature — its data layer plus the shared
// per-task project picker. Other features import from here, not from
// projects/queries/* or projects/mutations/* internals. Never re-export Screen
// (it would drag the whole view graph into every consumer and risk cycles).
//
// Phase 108: the app-wide "active project" scope (Fáze 11/Phase 24) is gone —
// ZIBBY always shows every project's data at once. `ProjectSelect` survives as
// `CommandLine`'s inline, per-task project picker; its retired standalone host
// and the scope indicator that used to sit beside it are deleted along with
// the context that backed them.
export * from "./queries";
export * from "./mutations";
export { ProjectSelect } from "./components/ProjectSelect";
