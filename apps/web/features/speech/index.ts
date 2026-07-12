// Public surface of the speech feature — its data layer (Phase 119c: voice catalog
// + daemon status for the `/settings` voice picker). The phase-120 synthesize
// mutation intentionally stays in `features/chat/mutations` — it's chat-specific,
// not a speech-domain concern.
export * from "./queries";
