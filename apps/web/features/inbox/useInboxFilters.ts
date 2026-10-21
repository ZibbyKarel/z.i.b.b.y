"use client";

import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef } from "react";
import { EMPTY_INBOX_FILTERS, type InboxFilters, hasInboxFilters } from "./inbox";

const STORAGE_KEY = "zibby-inbox-filters";
const DIMENSIONS = ["company", "team", "project"] as const;

function parseDimension(raw: string | null): string[] {
  return raw ? raw.split(",").filter(Boolean) : [];
}

/** The last filters the operator chose (localStorage), without touching the URL — for views outside the inbox. */
export function readStoredInboxFilters(): InboxFilters | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const pick = (key: (typeof DIMENSIONS)[number]) => {
      const value = (parsed as Record<string, unknown>)[key];
      return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
    };
    return { company: pick("company"), team: pick("team"), project: pick("project") };
  } catch {
    return null;
  }
}

function writeStored(filters: InboxFilters) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
  } catch {
    // Storage unavailable (private mode / quota): the URL still carries the state.
  }
}

/**
 * The company / team / project filters shared by Overview, Issues and Pull
 * requests. The URL query (`?company=a,b&team=…&project=…`) is the state; the last
 * choice is mirrored to `localStorage` and restored, once per mount, when the
 * URL carries none. Other query params (e.g. `?pr=`) are left alone.
 */
export function useInboxFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const company = searchParams.get("company");
  const team = searchParams.get("team");
  const project = searchParams.get("project");
  const filters = useMemo<InboxFilters>(
    () => ({
      company: parseDimension(company),
      team: parseDimension(team),
      project: parseDimension(project),
    }),
    [company, team, project],
  );

  const replace = (next: InboxFilters) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const dim of DIMENSIONS) {
      if (next[dim].length) params.set(dim, next[dim].join(","));
      else params.delete(dim);
    }
    const qs = params.toString();
    router.replace((qs ? `${pathname}?${qs}` : pathname) as Route);
  };

  const restored = useRef(false);
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    if (hasInboxFilters(filters)) return;
    const stored = readStoredInboxFilters();
    if (stored && hasInboxFilters(stored)) replace(stored);
    // Mount-only restore; `replace` closes over the first render's params.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setFilters = (patch: Partial<InboxFilters>) => {
    const next = { ...filters, ...patch };
    writeStored(next);
    replace(next);
  };

  return {
    filters,
    setFilters,
    clearFilters: () => {
      writeStored(EMPTY_INBOX_FILTERS);
      replace(EMPTY_INBOX_FILTERS);
    },
  };
}
