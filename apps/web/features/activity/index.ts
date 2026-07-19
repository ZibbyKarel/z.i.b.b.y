// Public surface of the activity feature — its data layer. Other features import
// from here, not from activity/queries/* internals. `activityLog.ts` (the pure row
// builder) and `components/ActivityFeed/` are imported by their direct paths, same
// as before the F8c relocation out of `features/overview/` (D19).
export * from "./queries";
