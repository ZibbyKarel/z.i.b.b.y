"use client";

import { useEffect, useRef, useState } from "react";
import { MinionWalker } from "../Minion/MinionWalker";
import { type WalkerTrip, walkerFrame } from "./walkerPaths";
import { OrgFloorplanTestId } from "./types";
import type { MinionAppearance } from "../Minion/minionAppearance";

/** The design steps its runners every 120ms with a matching CSS transition. */
const TICK_MS = 120;

export interface FloorplanWalkersProps {
  trips: readonly WalkerTrip[];
  appearanceOf: (agentId: string) => MinionAppearance;
  /** Fired once per trip when the minion is back at its desk. */
  onDone: (walkerId: string) => void;
}

/**
 * The minions carrying work between rooms. Owns the clock so the (memoised) world never
 * re-renders per frame; each trip runs once from the moment it first appears.
 */
export function FloorplanWalkers({ trips, appearanceOf, onDone }: FloorplanWalkersProps) {
  const [elapsed, setElapsed] = useState<Readonly<Record<string, number>>>({});
  const starts = useRef(new Map<string, number>());
  const finished = useRef(new Set<string>());
  const doneRef = useRef(onDone);
  useEffect(() => {
    doneRef.current = onDone;
  });

  useEffect(() => {
    if (trips.length === 0) return;
    const live = new Set(trips.map((t) => t.walker.id));
    for (const id of starts.current.keys()) if (!live.has(id)) starts.current.delete(id);
    for (const id of finished.current) if (!live.has(id)) finished.current.delete(id);
    const t0 = Date.now();
    for (const id of live) if (!starts.current.has(id)) starts.current.set(id, t0);
    const tick = () => {
      const now = Date.now();
      const next: Record<string, number> = {};
      for (const trip of trips) {
        const id = trip.walker.id;
        if (finished.current.has(id)) continue;
        const sec = (now - (starts.current.get(id) ?? now)) / 1000;
        if (sec >= trip.total) {
          finished.current.add(id);
          doneRef.current(id);
        } else next[id] = sec;
      }
      setElapsed(next);
    };
    const timer = setInterval(tick, TICK_MS);
    return () => clearInterval(timer);
  }, [trips]);

  return (
    <>
      {trips.map((trip) => {
        const frame = walkerFrame(trip, elapsed[trip.walker.id] ?? 0);
        if (!frame) return null;
        return (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute z-[6] h-0 w-0"
            data-testid={`${OrgFloorplanTestId.Walker}-${trip.walker.id}`}
            key={trip.walker.id}
            style={{
              left: frame.pos[0],
              top: frame.pos[1],
              transition: `left ${TICK_MS}ms linear, top ${TICK_MS}ms linear`,
            }}
          >
            <div className="absolute left-[-24px] top-[-58px] h-[60px] w-[48px]">
              {frame.carry && (
                <div className="absolute left-[24px] top-[-14px] z-[2] flex -translate-x-1/2 items-center gap-[4px] whitespace-nowrap border border-ink bg-panel px-[5px] py-[1px] font-mono text-[9px] tracking-[0.08em]">
                  <span className="h-[5px] w-[5px] shrink-0 bg-ink" />
                  <span className="max-w-[110px] truncate">{trip.walker.label}</span>
                </div>
              )}
              <div className="absolute left-0 top-[2px]">
                <MinionWalker
                  appearance={appearanceOf(trip.agentId)}
                  carry={frame.carry}
                  size={56}
                />
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}
