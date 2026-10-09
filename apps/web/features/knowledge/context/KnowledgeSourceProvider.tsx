"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";
import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTeamsQuery } from "../../teams/queries";
import {
  KnowledgeSourceContext,
  type KnowledgeSourceValue,
  TEAM_SOURCE_PREFIX,
  VAULT_SOURCE,
} from "./useKnowledgeSource";

/**
 * Holds the Knowledge section's source selection (`vault` | `team:<id>`) above the
 * three tab pages (mounted in `knowledge/layout.tsx`, which does not remount on a
 * tab change). Initialised from `?source=`; the URL param is kept in sync and
 * re-applied when a tab link drops it. An explicit `?source=` that differs from the
 * state (e.g. a graph-node link) wins. A team that is unknown or has no KB falls
 * back to the vault.
 */
export function KnowledgeSourceProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: teams } = useTeamsQuery();

  const param = searchParams.get("source");
  const [raw, setRaw] = useState(param ?? VAULT_SOURCE);
  // The `?source=` value last seen in the URL: a different non-null value is an explicit
  // navigation (e.g. a graph-node link) and wins over the state — adjusted during render.
  const [seenParam, setSeenParam] = useState(param);
  if (param !== seenParam) {
    setSeenParam(param);
    if (param !== null) setRaw(param);
  }

  const kbTeams = useMemo(() => (teams ?? []).filter((team) => team.knowledgeBase), [teams]);
  const rawTeamId = raw.startsWith(TEAM_SOURCE_PREFIX)
    ? raw.slice(TEAM_SOURCE_PREFIX.length)
    : null;
  // Until the team list has loaded the selection is trusted; afterwards it is validated.
  const valid = rawTeamId === null || !teams || kbTeams.some((team) => team.id === rawTeamId);
  const source = valid ? raw : VAULT_SOURCE;
  const teamId = source.startsWith(TEAM_SOURCE_PREFIX)
    ? source.slice(TEAM_SOURCE_PREFIX.length)
    : null;

  // Keep the URL equal to the selection — this is also what re-applies the param after
  // a tab link dropped the query string. The vault is the param-less default.
  const desired = source === VAULT_SOURCE ? null : source;
  useEffect(() => {
    if (param === desired) return;
    const next = new URLSearchParams(searchParams.toString());
    if (desired === null) next.delete("source");
    else next.set("source", desired);
    const qs = next.toString();
    router.replace((qs ? `${pathname}?${qs}` : pathname) as Route, { scroll: false });
  }, [param, desired, pathname, router, searchParams]);

  const value = useMemo<KnowledgeSourceValue>(
    () => ({ source, teamId, isVault: teamId === null, kbTeams, setSource: setRaw }),
    [source, teamId, kbTeams],
  );
  return (
    <KnowledgeSourceContext.Provider value={value}>{children}</KnowledgeSourceContext.Provider>
  );
}
