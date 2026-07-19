// Public surface of the briefing feature — its data layer. Other features import
// from here, not from briefing/queries/* or briefing/mutations/* internals. The
// shared row components (`NeedsYouRow`, `SubsystemLineRow`, `BriefingCardTestId`)
// live in `components/BriefingRows` and are imported by their direct path by both
// `overview/BriefingCard` and `chat/BriefingMessageCard` (D18) — neither imports
// from the other.
export * from "./queries";
export * from "./mutations";
