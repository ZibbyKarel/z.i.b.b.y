/**
 * The `/work/projects/[id]/[tab]` sections (ZB-06). Lives in its own plain
 * (non-`"use client"`) module rather than `ProjectDetailScreen.tsx`: the
 * owning server page (`app/(company)/work/projects/[id]/[tab]/page.tsx`)
 * needs this array at module init to validate the dynamic segment, and a
 * plain value re-exported from a `"use client"` file is not reliably readable
 * from a server module under the dev bundler's client/server boundary — it
 * can read back as `undefined` (`(PROJECT_TABS as readonly
 * string[]).includes` throwing "not a function") even though a production
 * build works fine. Splitting the pure constant out of the client component
 * file sidesteps the boundary entirely.
 */
export const PROJECT_TABS = ["overview", "profile", "secrets", "integrations", "roadmap"] as const;
export type ProjectTab = (typeof PROJECT_TABS)[number];
