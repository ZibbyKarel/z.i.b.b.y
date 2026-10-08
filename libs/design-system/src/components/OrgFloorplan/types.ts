import type { StateTone } from "../../stateTone";

export enum OrgFloorplanTestId {
  Root = "org-floorplan-root",
  Canvas = "org-floorplan-canvas",
  World = "org-floorplan-world",
  Spine = "org-floorplan-spine",
  Corridor = "org-floorplan-corridor",
  Coo = "org-floorplan-coo",
  /** the speech bubble above the COO avatar */
  CooSpeech = "org-floorplan-coo-speech",
  /** suffixed `-<roomId>` */
  Room = "org-floorplan-room",
  /** suffixed `-<roomId>` */
  RoomStrip = "org-floorplan-room-strip",
  /** suffixed `-<agentId>` */
  Desk = "org-floorplan-desk",
  /** suffixed `-<agentId>` */
  DeskBadge = "org-floorplan-desk-badge",
  /** suffixed `-<agentId>` */
  DeskRing = "org-floorplan-desk-ring",
  /** suffixed `-<agentId>` — the nameplate under the desk (state dot, name, role) */
  DeskTag = "org-floorplan-desk-tag",
  Controls = "org-floorplan-controls",
  Actions = "org-floorplan-actions",
  ZoomOut = "org-floorplan-zoom-out",
  ZoomLabel = "org-floorplan-zoom-label",
  ZoomIn = "org-floorplan-zoom-in",
  Fill = "org-floorplan-fill",
  Minimap = "org-floorplan-minimap",
  MinimapRoom = "org-floorplan-minimap-room",
  MinimapDot = "org-floorplan-minimap-dot",
  MinimapViewport = "org-floorplan-minimap-viewport",
  Popover = "org-floorplan-popover",
  PopoverName = "org-floorplan-popover-name",
  PopoverMeta = "org-floorplan-popover-meta",
  PopoverState = "org-floorplan-popover-state",
  PopoverTask = "org-floorplan-popover-task",
}

export type OrgFloorplanZone = "eng" | "ops" | "biz" | "per";

export interface OrgFloorplanAgent {
  id: string;
  name: string;
  /** Display id (e.g. `DEV-01`) for the popover meta and default aria label; falls back to `id`. */
  code?: string;
  /** Job title — on the desk nameplate under the name, and after the id in the popover head (`ID · ROLE`). */
  role?: string;
  state: StateTone;
  /** What the agent is working on right now; the popover section is skipped without it. */
  task?: string;
  /** Overrides the default `"<name>, <state label>"` accessible name of the desk. */
  ariaLabel?: string;
}

export interface OrgFloorplanRoom {
  id: string;
  code: string;
  name: string;
  zone: OrgFloorplanZone;
  agents: OrgFloorplanAgent[];
  /** Overrides the default `"<code> · <name>, <n> agents"` accessible name. */
  ariaLabel?: string;
}

export interface OrgFloorplanCoo {
  state: StateTone;
  /** Accessible name of the avatar (also its `<title>`). */
  label: string;
  /** Popover head name, default `Zibby`. */
  name?: string;
  /** Popover role, default `Chief Operating Officer`. */
  role?: string;
  task?: string;
  /** A line Zibby "says" — rendered in a speech bubble above the lobby avatar. */
  speech?: string;
  /** Overrides `label` as the accessible name of the lobby button. */
  ariaLabel?: string;
}

export interface OrgFloorplanLabels {
  zoomOut: string;
  zoomIn: string;
  zoomLevel: string;
  fill: string;
  minimap: string;
  workingOn: string;
}

export const DEFAULT_FLOORPLAN_LABELS: OrgFloorplanLabels = {
  zoomOut: "Zoom out",
  zoomIn: "Zoom in",
  zoomLevel: "Zoom level",
  fill: "Fill",
  minimap: "Map",
  workingOn: "Working on",
};

/** What the popover shows — an agent or the COO. */
export interface FloorplanHoverSubject {
  seed: string;
  name: string;
  meta: string;
  state: StateTone;
  task?: string;
  coo?: boolean;
}

export interface FloorplanHover {
  subject: FloorplanHoverSubject;
  x: number;
  y: number;
}
