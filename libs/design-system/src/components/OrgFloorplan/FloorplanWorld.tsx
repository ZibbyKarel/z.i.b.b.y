"use client";

import { Fragment, type KeyboardEvent, type MouseEvent, memo } from "react";
import { type StateTone, stateToneVar } from "../../stateTone";
import { cn } from "../../utils/cn";
import { focusRing } from "../../utils/focus";
import { minionAppearanceFromSeed } from "../Minion/minionAppearance";
import { MinionScene } from "../Minion/MinionScene";
import { MINION_K } from "../Minion/minionPalette";
import { StateDot } from "../StatePill/StatePill";
import { ZibbyAvatar } from "../ZibbyAvatar/ZibbyAvatar";
import { FLOORPLAN_METRICS, type FloorplanLayout, type PlacedRoom } from "./layoutFloorplan";
import {
  type FloorplanHoverSubject,
  type OrgFloorplanAgent,
  type OrgFloorplanCoo,
  type OrgFloorplanRoom,
  OrgFloorplanTestId,
} from "./types";

const { CW, CH, SW, CORR, BORDER } = FLOORPLAN_METRICS;

const DASH_X =
  "bg-[repeating-linear-gradient(to_right,var(--color-line-2)_0_8px,transparent_8px_20px)]";
const DASH_Y =
  "bg-[repeating-linear-gradient(to_bottom,var(--color-line-2)_0_8px,transparent_8px_20px)]";

/** Goggle-lens hue (oklch) per department id — the design's table; real ids are `dist` / `des`. */
export const ROOM_HUE: Readonly<Record<string, number>> = {
  dev: 95,
  rnd: 150,
  qa: 60,
  sec: 25,
  rel: 300,
  ops: 200,
  inc: 40,
  com: 250,
  knw: 175,
  fin: 130,
  dist: 80,
  pub: 330,
  des: 350,
  per: 270,
};
const DEFAULT_HUE = 95;

/** Table hue, else a deterministic hue hashed from the id (so an unknown room keeps its colour). */
export function roomHue(id: string): number {
  const known = ROOM_HUE[id];
  if (known !== undefined) return known;
  if (!id) return DEFAULT_HUE;
  let h = 7;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % 360;
}

const LENS_SHADOW = "0 0 0 3px var(--color-panel), inset 0 0 0 3px rgba(255,255,255,.55)";
const HAZARD =
  "bg-[repeating-linear-gradient(-45deg,var(--color-state-block)_0_6px,var(--color-ink)_6px_12px)]";

export interface FloorplanWorldProps {
  layout: FloorplanLayout;
  rooms: readonly OrgFloorplanRoom[];
  coo: OrgFloorplanCoo;
  stateLabels: Record<StateTone, string>;
  onRoom: (roomId: string) => void;
  onAgent: (roomId: string, agentId: string) => void;
  onCoo: () => void;
  onHover: (subject: FloorplanHoverSubject | null, el?: HTMLElement) => void;
  /** Employees currently out walking — their desk scene dims. */
  awayAgents?: ReadonlySet<string>;
}

/** Enter/Space activates a role="button" — only for the element's own key events. */
function activateOnKey(run: () => void) {
  return (e: KeyboardEvent<HTMLElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      run();
    }
  };
}

interface DeskProps {
  room: OrgFloorplanRoom;
  agent: OrgFloorplanAgent;
  /** global desk index — staggers the scene animations */
  index: number;
  away: boolean;
  x: number;
  y: number;
  stateLabels: Record<StateTone, string>;
  onAgent: FloorplanWorldProps["onAgent"];
  onHover: FloorplanWorldProps["onHover"];
}

function Desk({ room, agent, index, away, x, y, stateLabels, onAgent, onHover }: DeskProps) {
  const appearance = agent.appearance ?? minionAppearanceFromSeed(agent.id);
  const open = () => onAgent(room.id, agent.id);
  const show = (e: { currentTarget: HTMLElement }) =>
    onHover(
      {
        seed: agent.id,
        name: agent.name,
        meta: agent.role ? `${agent.code ?? agent.id} · ${agent.role}` : (agent.code ?? agent.id),
        state: agent.state,
        task: agent.task,
        appearance,
      },
      e.currentTarget,
    );
  return (
    <div
      aria-label={
        agent.ariaLabel ??
        `${agent.code ? `${agent.name} (${agent.code})` : agent.name}, ${stateLabels[agent.state]}`
      }
      className={cn("absolute cursor-pointer", focusRing)}
      data-testid={`${OrgFloorplanTestId.Desk}-${agent.id}`}
      onBlur={() => onHover(null)}
      onClick={(e: MouseEvent) => {
        e.stopPropagation();
        open();
      }}
      onFocus={show}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          e.stopPropagation();
          open();
        }
      }}
      onMouseEnter={show}
      onMouseLeave={() => onHover(null)}
      role="button"
      style={{ left: x, top: y, width: CW, height: CH }}
      tabIndex={0}
    >
      <div
        className={cn(
          "absolute left-[2px] top-0 transition-opacity duration-300",
          away ? "opacity-[0.18]" : "opacity-100",
        )}
        style={{ width: CW - 4 }}
      >
        <MinionScene
          appearance={appearance}
          ground={false}
          phase={-((index * 0.37) % 2.6)}
          state={agent.state}
        />
      </div>
      {/* Nameplate: state dot + NAME. */}
      <div
        className="absolute bottom-[3px] left-1/2 flex -translate-x-1/2 items-center gap-[5px] whitespace-nowrap border border-ink bg-panel px-[6px] py-[2px] font-mono uppercase"
        data-testid={`${OrgFloorplanTestId.DeskTag}-${agent.id}`}
      >
        <span className="flex shrink-0">
          <StateDot px={6} state={agent.state} />
        </span>
        <span className="text-[9px] font-semibold leading-none tracking-[0.1em]">{agent.name}</span>
      </div>
    </div>
  );
}

interface RoomProps extends Pick<FloorplanWorldProps, "onRoom"> {
  room: OrgFloorplanRoom;
  placed: PlacedRoom;
}

function Room({ room, placed, onRoom }: RoomProps) {
  const n = room.agents.length;
  return (
    <div
      aria-label={
        room.ariaLabel ?? `${room.code} · ${room.name}, ${n} ${n === 1 ? "agent" : "agents"}`
      }
      className={cn(
        "absolute box-border cursor-pointer rounded-[34px] border-[3px] border-double border-ink bg-panel",
        focusRing,
      )}
      data-testid={`${OrgFloorplanTestId.Room}-${room.id}`}
      onClick={() => onRoom(room.id)}
      onKeyDown={activateOnKey(() => onRoom(room.id))}
      role="button"
      style={{ left: placed.x, top: placed.y, width: placed.w, height: placed.h }}
      tabIndex={0}
    >
      <div
        className={cn(
          "absolute left-1/2 z-[2] ml-[-26px] h-[2px] w-[52px] bg-panel-2",
          placed.door === "down" ? "bottom-[-2px]" : "top-[-2px]",
        )}
      />
      <div
        className={cn(
          "absolute inset-x-[30px] bottom-[4px] h-[6px] rounded-[3px] opacity-75",
          HAZARD,
        )}
      />
      <div className="absolute inset-x-[22px] top-[13px] h-[5px] bg-ink opacity-[0.85]" />
      <div
        className="absolute left-[12px] top-[-24px] z-[3] box-border grid h-[58px] w-[58px] place-items-center rounded-full border-[5px] border-ink"
        data-testid={`${OrgFloorplanTestId.RoomLens}-${room.id}`}
        style={{ background: `oklch(0.86 0.12 ${roomHue(room.id)})`, boxShadow: LENS_SHADOW }}
      >
        <span
          className="font-mono text-[14px] font-bold tracking-[0.04em]"
          style={{ color: MINION_K }}
        >
          {room.code}
        </span>
      </div>
      <div className="absolute left-[80px] right-[14px] top-[2px] flex h-[26px] items-center gap-[8px]">
        <span className="min-w-0 truncate bg-panel px-[6px] text-[13px] font-semibold">
          {room.name}
        </span>
        <span className="flex-1" />
        <span
          className="flex gap-[3px] rounded-[8px] bg-panel px-[5px] py-[3px]"
          data-testid={`${OrgFloorplanTestId.RoomStrip}-${room.id}`}
        >
          {room.agents.map((a) => (
            <span
              className="h-[7px] w-[7px] rounded-full"
              key={a.id}
              style={{ background: stateToneVar[a.state] }}
            />
          ))}
        </span>
      </div>
    </div>
  );
}

/** Everything inside the pan/zoom world: spine, corridors, lobby, rooms. Memoised —
 *  panning only changes the parent's transform, never these props. */
export const FloorplanWorld = memo(function FloorplanWorld({
  layout,
  rooms,
  coo,
  stateLabels,
  onRoom,
  onAgent,
  onCoo,
  onHover,
  awayAgents,
}: FloorplanWorldProps) {
  const roomById = new Map(rooms.map((r) => [r.id, r]));
  let deskIndex = 0;
  const showCoo = (e: { currentTarget: HTMLElement }) =>
    onHover(
      {
        seed: "zibby",
        name: coo.name ?? "Zibby",
        meta: `COO · ${(coo.role ?? "Chief Operating Officer").toUpperCase()}`,
        state: coo.state,
        task: coo.task,
        coo: true,
      },
      e.currentTarget,
    );
  return (
    <>
      <div
        className="absolute box-border border-x border-line-2 bg-panel-2"
        data-testid={OrgFloorplanTestId.Spine}
        style={{
          left: layout.spineX - SW / 2,
          top: layout.spine.top,
          width: SW,
          height: layout.spine.height,
        }}
      >
        <div className={cn("absolute bottom-[12px] left-[27px] top-[12px] w-[2px]", DASH_Y)} />
      </div>
      {layout.corridors.map((y) => (
        <div
          className="absolute bg-panel-2"
          data-testid={OrgFloorplanTestId.Corridor}
          key={y}
          style={{
            left: layout.spineX - layout.side - SW / 2,
            top: y,
            width: 2 * layout.side + SW,
            height: CORR,
          }}
        >
          <div className={cn("absolute inset-x-[12px] top-[27px] h-[2px]", DASH_X)} />
        </div>
      ))}
      <div
        className="absolute"
        style={{
          left: layout.lobby.x,
          top: layout.lobby.y,
          width: layout.lobby.size,
          height: layout.lobby.size,
        }}
      >
        <div
          aria-label={coo.ariaLabel ?? coo.label}
          className={cn(
            "absolute left-1/2 top-1/2 ml-[-90px] mt-[-110px] grid h-[220px] w-[180px] cursor-pointer place-items-center",
            focusRing,
          )}
          data-testid={OrgFloorplanTestId.Coo}
          onBlur={() => onHover(null)}
          onClick={onCoo}
          onFocus={showCoo}
          onKeyDown={activateOnKey(onCoo)}
          onMouseEnter={showCoo}
          onMouseLeave={() => onHover(null)}
          role="button"
          tabIndex={0}
        >
          <ZibbyAvatar label={coo.label} size={200} state={coo.state} />
        </div>
        {coo.speech && (
          <div
            className="pointer-events-none absolute bottom-[calc(50%+104px)] left-1/2 -translate-x-1/2 whitespace-nowrap border border-ink bg-panel px-[12px] py-[7px] font-mono text-[12px] uppercase tracking-[0.12em]"
            data-testid={OrgFloorplanTestId.CooSpeech}
            role="status"
            style={{ color: stateToneVar[coo.state] }}
          >
            {coo.speech}
            {/* The tail — a rotated square straddling the bubble's bottom edge. */}
            <span className="absolute left-1/2 top-full -ml-[5px] -mt-[5px] h-[10px] w-[10px] rotate-45 border-b border-r border-ink bg-panel" />
          </div>
        )}
      </div>
      {layout.rooms.map((placed) => {
        const room = roomById.get(placed.id);
        if (!room) return null;
        // Desks are siblings of their room (not children) so no button nests in a button;
        // BORDER is the room's border width. Rendered after the room → painted on top.
        return (
          <Fragment key={room.id}>
            <Room onRoom={onRoom} placed={placed} room={room} />
            {room.agents.map((agent, i) => {
              const d = placed.desks[i];
              return d ? (
                <Desk
                  agent={agent}
                  away={awayAgents?.has(agent.id) ?? false}
                  index={deskIndex++}
                  key={agent.id}
                  onAgent={onAgent}
                  onHover={onHover}
                  room={room}
                  stateLabels={stateLabels}
                  x={placed.x + BORDER + d.x}
                  y={placed.y + BORDER + d.y}
                />
              ) : null;
            })}
          </Fragment>
        );
      })}
    </>
  );
});
