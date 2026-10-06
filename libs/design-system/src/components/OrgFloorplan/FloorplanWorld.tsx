"use client";

import { Fragment, type KeyboardEvent, type MouseEvent, memo } from "react";
import { type StateTone, stateToneVar } from "../../stateTone";
import { cn } from "../../utils/cn";
import { focusRing } from "../../utils/focus";
import { AgentGlyph } from "../AgentGlyph/AgentGlyph";
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

const { CW, CH, SW, CORR } = FLOORPLAN_METRICS;

const DASH_X =
  "bg-[repeating-linear-gradient(to_right,var(--color-line-2)_0_8px,transparent_8px_20px)]";
const DASH_Y =
  "bg-[repeating-linear-gradient(to_bottom,var(--color-line-2)_0_8px,transparent_8px_20px)]";

/** State → the desk badge glyph; other states carry none. */
const BADGE: Partial<Record<StateTone, string>> = { error: "!", blocked: "?", done: "✓" };
/** Seconds of the `zb-ring` pulse — error is the faster one. */
const RING_SECONDS: Partial<Record<StateTone, number>> = { error: 0.8, blocked: 1.2 };

export interface FloorplanWorldProps {
  layout: FloorplanLayout;
  rooms: readonly OrgFloorplanRoom[];
  coo: OrgFloorplanCoo;
  stateLabels: Record<StateTone, string>;
  onRoom: (roomId: string) => void;
  onAgent: (roomId: string, agentId: string) => void;
  onCoo: () => void;
  onHover: (subject: FloorplanHoverSubject | null, el?: HTMLElement) => void;
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
  x: number;
  y: number;
  stateLabels: Record<StateTone, string>;
  onAgent: FloorplanWorldProps["onAgent"];
  onHover: FloorplanWorldProps["onHover"];
}

function Desk({ room, agent, x, y, stateLabels, onAgent, onHover }: DeskProps) {
  const color = stateToneVar[agent.state];
  const badge = BADGE[agent.state];
  const ringSeconds = RING_SECONDS[agent.state];
  const open = () => onAgent(room.id, agent.id);
  const show = (e: { currentTarget: HTMLElement }) =>
    onHover(
      {
        seed: agent.id,
        name: agent.name,
        meta: agent.role ? `${agent.code ?? agent.id} · ${agent.role}` : (agent.code ?? agent.id),
        state: agent.state,
        task: agent.task,
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
      {ringSeconds !== undefined && (
        <div
          className="absolute left-[2px] top-[30px] box-border h-[30px] w-[68px] border"
          data-testid={`${OrgFloorplanTestId.DeskRing}-${agent.id}`}
          style={{ borderColor: color, animation: `zb-ring ${ringSeconds}s ease-out infinite` }}
        />
      )}
      <div className="absolute left-[8px] top-[34px] box-border h-[22px] w-[56px] border border-line-2 bg-panel-2" />
      <div className="absolute left-[24px] top-[37px] h-[4px] w-[24px] bg-ink-2" />
      <div className="absolute left-[28px] top-[46px] box-border h-[5px] w-[16px] border border-line-2 bg-panel" />
      <div className="absolute left-[22px] top-[4px]">
        <AgentGlyph glow={false} seed={agent.id} size={28} state={agent.state} />
      </div>
      {badge && (
        <div
          aria-hidden="true"
          className="absolute left-[46px] top-[-1px] grid h-[13px] w-[13px] place-items-center font-mono text-[10px] font-semibold leading-none text-panel"
          data-testid={`${OrgFloorplanTestId.DeskBadge}-${agent.id}`}
          style={{ background: color }}
        >
          {badge}
        </div>
      )}
      <div className="absolute inset-x-0 top-[62px] flex items-center justify-center gap-[4px] font-mono text-[9px] uppercase tracking-[0.1em] text-ink-2">
        <StateDot px={5} state={agent.state} />
        <span className="max-w-[56px] truncate">{agent.name}</span>
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
        "absolute box-border cursor-pointer border-2 border-ink",
        room.zone === "ops" ? "bg-bg" : "bg-panel",
        room.zone === "per" && "border-dashed",
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
          "absolute left-1/2 z-[2] ml-[-22px] h-[2px] w-[44px] bg-panel-2",
          placed.door === "down" ? "bottom-[-2px]" : "top-[-2px]",
        )}
      />
      <div className="absolute inset-x-[12px] top-0 flex h-[26px] items-center gap-[8px]">
        <span className="font-mono text-[11px] font-semibold tracking-[0.12em]">{room.code}</span>
        <span className="min-w-0 truncate text-[12px] text-ink-2">{room.name}</span>
        <span className="flex-1" />
        <span className="flex gap-[3px]" data-testid={`${OrgFloorplanTestId.RoomStrip}-${room.id}`}>
          {room.agents.map((a) => (
            <span
              className="h-[7px] w-[7px]"
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
}: FloorplanWorldProps) {
  const roomById = new Map(rooms.map((r) => [r.id, r]));
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
          <div className={cn("absolute inset-x-[12px] top-[21px] h-[2px]", DASH_X)} />
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
            "absolute left-1/2 top-1/2 ml-[-74px] mt-[-74px] grid h-[148px] w-[148px] cursor-pointer place-items-center",
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
          <ZibbyAvatar label={coo.label} size={128} state={coo.state} />
        </div>
      </div>
      {layout.rooms.map((placed) => {
        const room = roomById.get(placed.id);
        if (!room) return null;
        // Desks are siblings of their room (not children) so no button nests in a button;
        // the +2 is the room's border width. Rendered after the room → painted on top.
        return (
          <Fragment key={room.id}>
            <Room onRoom={onRoom} placed={placed} room={room} />
            {room.agents.map((agent, i) => {
              const d = placed.desks[i];
              return d ? (
                <Desk
                  agent={agent}
                  key={agent.id}
                  onAgent={onAgent}
                  onHover={onHover}
                  room={room}
                  stateLabels={stateLabels}
                  x={placed.x + 2 + d.x}
                  y={placed.y + 2 + d.y}
                />
              ) : null;
            })}
          </Fragment>
        );
      })}
    </>
  );
});
