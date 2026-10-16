import type { OrgFloorplanWalker } from "@zibby/design-system";
import { useCallback, useEffect, useRef, useState } from "react";
import { type HandoffEmployee, deriveHandoffWalkers } from "./deriveHandoffWalkers";

/** Safety net: a walker whose `onWalkerDone` never fires is dropped after this long. */
export const WALKER_TTL_MS = 60_000;

/**
 * Keeps the active hand-off walkers: each new employee snapshot is diffed against
 * the previous one ({@link deriveHandoffWalkers}); walkers stay until the floorplan
 * reports them done (or the TTL expires). The first snapshot yields none.
 */
export function useHandoffWalkers(employees: readonly HandoffEmployee[]) {
  const [walkers, setWalkers] = useState<OrgFloorplanWalker[]>([]);
  const previous = useRef<readonly HandoffEmployee[] | undefined>(undefined);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const remove = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
    setWalkers((all) => (all.some((w) => w.id === id) ? all.filter((w) => w.id !== id) : all));
  }, []);

  useEffect(() => {
    const derived = deriveHandoffWalkers(previous.current, employees);
    previous.current = employees;
    if (derived.length === 0) return;
    setWalkers((all) => {
      const known = new Set(all.map((w) => w.id));
      const fresh = derived.filter((w) => !known.has(w.id));
      for (const w of fresh) {
        timers.current.set(
          w.id,
          setTimeout(() => remove(w.id), WALKER_TTL_MS),
        );
      }
      return fresh.length > 0 ? [...all, ...fresh] : all;
    });
  }, [employees, remove]);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const t of pending.values()) clearTimeout(t);
      pending.clear();
    };
  }, []);

  return { walkers, onWalkerDone: remove };
}
