/**
 * The global registry kinds (`/system/registries/<kind>`, ZB-11). Lives in
 * its own plain (non-`"use client"`) module rather than `RegistriesScreen.tsx`:
 * the owning server page (`app/(company)/system/registries/[kind]/page.tsx`)
 * needs this array at module init to validate the dynamic segment, and a plain
 * value re-exported from a `"use client"` file is not reliably readable from a
 * server module under the dev bundler's client/server boundary — it can read
 * back as `undefined` (`(REGISTRY_KINDS as readonly string[]).includes` throwing
 * "not a function") even though a production build works fine. Splitting the
 * pure constant out of the client component file sidesteps the boundary
 * entirely.
 */
export const REGISTRY_KINDS = ["skills", "mcp", "hooks", "commands"] as const;

/** Every kind `RegistriesScreen` renders — agents live under `/workforce`. */
export type RegistryKindParam = (typeof REGISTRY_KINDS)[number] | "agents";

/** Web route of a registry list (`id` omitted) or detail page. */
export function registryHref(kind: RegistryKindParam, id?: string): string {
  const base = kind === "agents" ? "/workforce/agents" : `/system/registries/${kind}`;
  return id ? `${base}/${id}` : base;
}
