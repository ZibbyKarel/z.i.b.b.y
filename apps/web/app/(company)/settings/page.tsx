import { redirect } from "next/navigation";
import type { Route } from "next";

/**
 * `/settings(?tab=<old-tab>)` (ROUTE-MAP §3, ZB-11/ZB-13). A page-level
 * redirect rather than a `next.config.mjs` static rule: Next's `redirects()`
 * forwards an incoming query string it didn't consume onto the destination by
 * default, so a static `has: [{ type: "query", key: "tab", value: "system" }]`
 * rule landed on `/system/settings/status?tab=system`, not the clean target
 * URL — reading `searchParams` here and calling `redirect()` with a literal
 * destination avoids that entirely (single redirect location, D-009).
 *
 * An absent or unrecognized `tab` lands on `/system/settings/general`, same as
 * the bare `/settings` catch-all this replaces.
 */
const TAB_DESTINATION: Record<string, Route> = {
  gates: "/policy/gates",
  mandate: "/policy/gates?section=mandate" as Route,
  // `/system/settings/[section]` is a dynamic segment — typed routes can't
  // validate a literal path against it, so each one needs an explicit cast.
  preferences: "/system/settings/general" as Route,
  tasks: "/system/settings/general" as Route,
  automations: "/system/settings/automations" as Route,
  chat: "/system/settings/coo" as Route,
  activity: "/system/settings/activity" as Route,
  runtime: "/system/settings/runtime" as Route,
  machine: "/system/settings/machine" as Route,
  selfKnowledge: "/knowledge/distill",
  system: "/system/settings/status" as Route,
};

export default async function SettingsRedirectPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  redirect((tab && TAB_DESTINATION[tab]) || "/system/settings/general");
}
