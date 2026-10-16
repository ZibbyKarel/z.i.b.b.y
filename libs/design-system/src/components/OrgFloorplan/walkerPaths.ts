/**
 * Pure path + timing logic of the walkers (the design's `paths` / `along` / `runnerFrame`):
 * desk → own door → corridor → (spine if the corridor differs) → destination door.
 * Unlike the design these trips run once, not cyclically.
 */
import { FLOORPLAN_METRICS, type FloorplanLayout } from "./layoutFloorplan";
import type { OrgFloorplanRoom, OrgFloorplanWalker } from "./types";

const { CW, CH, BORDER } = FLOORPLAN_METRICS;

/** World px per second. */
export const WALK_SPEED = 150;
/** Seconds spent at the destination before walking back. */
export const WALK_DWELL = 4.5;

type Point = readonly [number, number];

export interface WalkerTrip {
  walker: OrgFloorplanWalker;
  roomId: string;
  /** the walking employee */
  agentId: string;
  pts: readonly Point[];
  /** cumulative length at each point */
  cl: readonly number[];
  len: number;
  /** seconds, outbound + dwell + return */
  total: number;
}

export interface WalkerFrame {
  pos: Point;
  carry: boolean;
}

/** Resolves every walker that can actually walk; unknown agents/rooms and own-room trips are dropped. */
export function buildTrips(
  layout: FloorplanLayout,
  rooms: readonly OrgFloorplanRoom[],
  walkers: readonly OrgFloorplanWalker[],
): WalkerTrip[] {
  const placedById = new Map(layout.rooms.map((p) => [p.id, p]));
  const trips: WalkerTrip[] = [];
  for (const walker of walkers) {
    const home = rooms.find((r) => r.agents.some((a) => a.id === walker.agentId));
    if (!home || home.id === walker.toRoomId) continue;
    const from = placedById.get(home.id);
    const to = placedById.get(walker.toRoomId);
    const desk = from?.desks[home.agents.findIndex((a) => a.id === walker.agentId)];
    if (!from || !to || !desk) continue;
    const ax = from.x + BORDER + desk.x + CW / 2;
    const ay = from.y + BORDER + desk.y + CH * 0.72;
    const pts: Point[] =
      from.corrY === to.corrY
        ? [
            [ax, ay],
            [from.doorX, ay],
            [from.doorX, from.corrY],
            [to.doorX, from.corrY],
          ]
        : [
            [ax, ay],
            [from.doorX, ay],
            [from.doorX, from.corrY],
            [layout.spineX, from.corrY],
            [layout.spineX, to.corrY],
            [to.doorX, to.corrY],
          ];
    const cl = [0];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1] as Point;
      const b = pts[i] as Point;
      cl.push((cl[i - 1] ?? 0) + Math.hypot(b[0] - a[0], b[1] - a[1]));
    }
    const len = cl[cl.length - 1] ?? 0;
    trips.push({
      walker,
      roomId: home.id,
      agentId: walker.agentId,
      pts,
      cl,
      len,
      total: (2 * len) / WALK_SPEED + WALK_DWELL,
    });
  }
  return trips;
}

function along(trip: WalkerTrip, dist: number): Point {
  const d = Math.max(0, Math.min(trip.len, dist));
  let i = 1;
  while (i < trip.cl.length - 1 && (trip.cl[i] ?? 0) < d) i++;
  const c0 = trip.cl[i - 1] ?? 0;
  const c1 = trip.cl[i] ?? 0;
  const p0 = trip.pts[i - 1] ?? [0, 0];
  const p1 = trip.pts[i] ?? p0;
  const t = (d - c0) / (c1 - c0 || 1);
  return [p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t];
}

/** Where the walker is `elapsed` seconds into its trip; null once it is back at its desk. */
export function walkerFrame(trip: WalkerTrip, elapsed: number): WalkerFrame | null {
  const out = trip.len / WALK_SPEED;
  if (elapsed < 0) return null;
  if (elapsed < out) return { pos: along(trip, elapsed * WALK_SPEED), carry: true };
  if (elapsed < out + WALK_DWELL) return { pos: along(trip, trip.len), carry: true };
  if (elapsed < 2 * out + WALK_DWELL) {
    return { pos: along(trip, (2 * out + WALK_DWELL - elapsed) * WALK_SPEED), carry: false };
  }
  return null;
}
