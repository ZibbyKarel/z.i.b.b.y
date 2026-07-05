"use client";

import { type ReactNode, createContext, useCallback, useContext, useMemo, useState } from "react";
import { useProjectsQuery } from "../queries";

/** Cookie persisting the operator's active-project choice (Fáze 11) — same
 * no-path-prefix approach as the `locale` cookie (`apps/web/i18n/request.ts`). */
export const ACTIVE_PROJECT_COOKIE = "activeProject";

/** ~1 year — the active project is a workspace preference, not a session value. */
const COOKIE_MAX_AGE_S = 60 * 60 * 24 * 365;

/** Read the persisted selection; empty/missing cookie reads as `null` (all projects). */
function readActiveProjectCookie(): string | null {
  if (typeof document === "undefined") return null;
  const row = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(`${ACTIVE_PROJECT_COOKIE}=`));
  const raw = row?.slice(ACTIVE_PROJECT_COOKIE.length + 1);
  return raw ? decodeURIComponent(raw) : null;
}

/** Persist the selection; `null` writes an empty value (= "Všechny projekty"). */
function writeActiveProjectCookie(id: string | null): void {
  const value = id === null ? "" : encodeURIComponent(id);
  document.cookie = `${ACTIVE_PROJECT_COOKIE}=${value}; path=/; max-age=${COOKIE_MAX_AGE_S}; SameSite=Lax`;
}

interface ProjectStore {
  /** The active engagement scoping the dashboard, or `null` = "Všechny projekty". */
  activeProjectId: string | null;
  setActiveProject: (id: string | null) => void;
}

const ProjectContext = createContext<ProjectStore | null>(null);

/**
 * App-wide active-project context (Fáze 11 multi-project UX). The selection is a
 * pure client-side view scope — screens filter already-attributed data by it; it is
 * NOT a security boundary. Persisted in the `activeProject` cookie so it survives
 * navigation and reload (lazy init mirrors `MainLayout`'s rail persistence).
 * Mounted in `AppShell` alongside `CatalogProvider` — the project scope is a
 * dashboard concern, not a root-provider one.
 */
export function ProjectProvider({ children }: { children: ReactNode }) {
  const [rawId, setRawId] = useState<string | null>(() => readActiveProjectCookie());
  const { data: projects } = useProjectsQuery();

  const setActiveProject = useCallback((id: string | null) => {
    setRawId(id);
    writeActiveProjectCookie(id);
  }, []);

  // Unknown-project guard: a cookie pointing at a project that no longer exists in
  // the registry behaves as `null` — WITHOUT clearing the cookie (the registry may
  // simply not have loaded yet, and an aggressive reset would lose the selection).
  const activeProjectId =
    rawId !== null && projects !== undefined && !projects.some((p) => p.id === rawId)
      ? null
      : rawId;

  const value = useMemo<ProjectStore>(
    () => ({ activeProjectId, setActiveProject }),
    [activeProjectId, setActiveProject],
  );

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

export function useActiveProject(): ProjectStore {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error("useActiveProject must be used within ProjectProvider");
  return ctx;
}
