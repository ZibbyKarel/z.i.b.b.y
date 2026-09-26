/**
 * The `/system/settings/<section>` sections (ROUTE-MAP §3). Lives in its own
 * plain (non-`"use client"`) module rather than `Screen.tsx`: the owning server
 * page (`app/(company)/system/settings/[section]/page.tsx`) needs this array
 * at module init to validate the dynamic segment, and a plain value re-exported
 * from a `"use client"` file is not reliably readable from a server module
 * under the dev bundler's client/server boundary — it can read back as
 * `undefined` (`(SETTINGS_SECTIONS as readonly string[]).includes` throwing
 * "not a function") even though a production build works fine. Splitting the
 * pure constant out of the client component file sidesteps the boundary
 * entirely.
 */
export const SETTINGS_SECTIONS = [
  "general",
  "appearance",
  "coo",
  "activity",
  "automations",
  "runtime",
  "machine",
  "status",
] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];
