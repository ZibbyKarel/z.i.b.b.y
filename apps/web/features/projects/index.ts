// Public surface of the projects feature — its data layer plus the Fáze 11
// project-context provider and its two chrome composites. Other features import
// from here, not from projects/queries/* or projects/mutations/* internals. Never re-export
// Screen (it would drag the whole view graph into every consumer and risk cycles).
export * from "./queries";
export * from "./mutations";
export { ACTIVE_PROJECT_COOKIE, ProjectProvider, useActiveProject } from "./context/ProjectProvider";
export { ProjectSwitcher, ProjectSwitcherTestId } from "./components/ProjectSwitcher";
export { ProjectScopeChip, ProjectScopeChipTestId } from "./components/ProjectScopeChip";
