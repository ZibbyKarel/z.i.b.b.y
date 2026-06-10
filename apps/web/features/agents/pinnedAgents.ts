"use client";

import { useSyncExternalStore } from "react";

/**
 * Quick-launch pins: the set of agent ids the user has pinned to the Overview
 * launch panel. Persisted per-browser in localStorage (no cross-device sync —
 * deliberately lightweight, no backend contract) and exposed through
 * `useSyncExternalStore` so every pin toggle and the panel stay in lockstep
 * within a tab, and across tabs via the `storage` event.
 */

const STORAGE_KEY = "zibby.pinnedAgents";

/** Stable empty reference for SSR / pre-init — `getSnapshot` must never return a fresh array. */
const EMPTY: readonly string[] = [];

/**
 * The cached snapshot. `getSnapshot` returns this reference unchanged between
 * mutations; it is reassigned only inside `write` and the `storage` handler, so
 * React's identity check stays satisfied (no "getSnapshot should be cached" loop).
 */
let cache: readonly string[] = EMPTY;
let initialized = false;

const listeners = new Set<() => void>();
let windowBound = false;

function readStorage(): readonly string[] {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return EMPTY;
    return parsed.filter((x): x is string => typeof x === "string");
  } catch {
    return EMPTY;
  }
}

function ensureInit(): void {
  if (initialized || typeof window === "undefined") return;
  cache = readStorage();
  initialized = true;
}

function emit(): void {
  for (const listener of listeners) listener();
}

function bindWindow(): void {
  if (windowBound || typeof window === "undefined") return;
  windowBound = true;
  window.addEventListener("storage", (e) => {
    if (e.key === STORAGE_KEY) {
      cache = readStorage();
      emit();
    }
  });
}

function write(next: readonly string[]): void {
  cache = next;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable — pins stay in memory for this session */
    }
  }
  emit();
}

function subscribe(callback: () => void): () => void {
  ensureInit();
  bindWindow();
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

function getSnapshot(): readonly string[] {
  ensureInit();
  return cache;
}

function getServerSnapshot(): readonly string[] {
  return EMPTY;
}

/** Is this agent currently pinned? (Non-reactive read, e.g. inside event handlers.) */
export function isAgentPinned(id: string): boolean {
  ensureInit();
  return cache.includes(id);
}

/** Pin or unpin an agent. New pins append to the end so order reflects pin time. */
export function togglePinnedAgent(id: string): void {
  ensureInit();
  write(cache.includes(id) ? cache.filter((x) => x !== id) : [...cache, id]);
}

/** Reactive list of pinned agent ids, in pin order. Re-renders on any pin change. */
export function usePinnedAgents(): readonly string[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
