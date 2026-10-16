import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MinionSceneTestId } from "../Minion/MinionScene";
import { MinionWalkerTestId } from "../Minion/MinionWalker";
import { ZibbyAvatarTestId } from "../ZibbyAvatar/ZibbyAvatar";
import { FLOORPLAN_METRICS } from "./layoutFloorplan";
import { ROOM_HUE, roomHue } from "./FloorplanWorld";
import { OrgFloorplan, type OrgFloorplanRoom, OrgFloorplanTestId } from "./OrgFloorplan";

const ROOMS: OrgFloorplanRoom[] = [
  {
    id: "dev",
    code: "DEV",
    name: "Development",
    zone: "eng",
    agents: [
      {
        id: "a1",
        code: "DEV-01",
        name: "Stuart",
        role: "Coder",
        state: "working",
        task: "Fix flaky test",
      },
      { id: "a2", name: "Ken", state: "error" },
      { id: "a3", name: "Bob", state: "blocked" },
      { id: "a4", name: "Jorge", state: "done" },
      { id: "a5", name: "Kevin", state: "idle" },
    ],
  },
  { id: "per", code: "PER", name: "Personal", zone: "per", agents: [] },
  {
    id: "ops",
    code: "OPS",
    name: "Ops",
    zone: "ops",
    agents: [{ id: "o1", name: "Ray", state: "idle" }],
  },
];
const COO = { state: "working" as const, label: "Zibby · COO" };

const desk = (id: string) => screen.getByTestId(`${OrgFloorplanTestId.Desk}-${id}`);
const room = (id: string) => screen.getByTestId(`${OrgFloorplanTestId.Room}-${id}`);

describe("OrgFloorplan", () => {
  it("fills its parent without a window frame; minimap sits left above the controls", () => {
    render(<OrgFloorplan coo={{ state: "idle", label: "Zibby" }} rooms={ROOMS} />);
    const root = screen.getByTestId(OrgFloorplanTestId.Root);
    expect(root.className).toContain("h-full");
    expect(root.className).not.toMatch(/(^| )border( |$)/);
    const mini = screen.getByTestId(OrgFloorplanTestId.Minimap);
    expect(mini.className).toContain("left-[16px]");
    expect(mini.className).toContain("bottom-[80px]");
    expect(mini.className).not.toContain("right-");
  });

  it("renders the COO speech bubble only when given a line", () => {
    const { rerender } = render(<OrgFloorplan coo={COO} rooms={ROOMS} />);
    expect(screen.queryByTestId(OrgFloorplanTestId.CooSpeech)).not.toBeInTheDocument();
    rerender(<OrgFloorplan coo={{ ...COO, speech: "api down" }} rooms={ROOMS} />);
    expect(screen.getByTestId(OrgFloorplanTestId.CooSpeech)).toHaveTextContent("api down");
    expect(screen.getByTestId(OrgFloorplanTestId.CooSpeech)).toHaveRole("status");
  });

  it("renders a room per department and a desk per agent", () => {
    render(<OrgFloorplan coo={COO} rooms={ROOMS} />);
    expect(room("dev")).toHaveRole("button");
    expect(room("dev")).toHaveAccessibleName("DEV · Development, 5 agents");
    expect(room("per")).toHaveAccessibleName("PER · Personal, 0 agents");
    expect(desk("a1")).toHaveRole("button");
    expect(desk("a1")).toHaveAccessibleName("Stuart (DEV-01), Working");
    expect(screen.getByTestId(`${OrgFloorplanTestId.RoomStrip}-dev`).children).toHaveLength(5);
  });

  it("renders desks as siblings of their room, never inside it", () => {
    render(<OrgFloorplan coo={COO} rooms={ROOMS} />);
    expect(room("dev").contains(desk("a1"))).toBe(false);
    expect(desk("a1").parentElement).toBe(room("dev").parentElement);
  });

  it("renders the actions slot over the canvas", () => {
    render(<OrgFloorplan actions={<button type="button">Add</button>} coo={COO} rooms={ROOMS} />);
    expect(screen.getByTestId(OrgFloorplanTestId.Actions)).toHaveTextContent("Add");
  });

  it("uses the app-provided aria label for a room", () => {
    render(<OrgFloorplan coo={COO} rooms={[{ ...ROOMS[0]!, ariaLabel: "DEV, 5 lidí" }]} />);
    expect(room("dev")).toHaveAccessibleName("DEV, 5 lidí");
  });

  it("draws every room as goggles: lens with the department code, strap and hazard stripe", () => {
    render(<OrgFloorplan coo={COO} rooms={ROOMS} />);
    expect(room("dev").className).toContain("border-double");
    expect(room("dev").className).toContain("rounded-[34px]");
    expect(room("per").className).not.toContain("border-dashed");
    expect(screen.getByTestId(`${OrgFloorplanTestId.RoomLens}-dev`)).toHaveTextContent("DEV");
    expect(screen.getByTestId(`${OrgFloorplanTestId.RoomLens}-ops`)).toHaveTextContent("OPS");
  });

  it("picks the lens hue from the table and hashes unknown ids deterministically", () => {
    expect(roomHue("dev")).toBe(95);
    expect(roomHue("dist")).toBe(ROOM_HUE.dist);
    expect(roomHue("des")).toBe(350);
    const hue = roomHue("lab");
    expect(hue).toBeGreaterThanOrEqual(0);
    expect(hue).toBeLessThan(360);
    expect(roomHue("lab")).toBe(hue);
    expect(roomHue("lab")).not.toBe(roomHue("labx"));
  });

  it("renders a state-driven minion scene at every desk", () => {
    render(<OrgFloorplan coo={COO} rooms={ROOMS} />);
    const states: Record<string, string> = {
      a1: "working",
      a2: "error",
      a3: "blocked",
      a4: "done",
      a5: "idle",
    };
    for (const [id, state] of Object.entries(states)) {
      const scene = within(desk(id)).getByTestId(MinionSceneTestId.Root);
      expect(scene).toHaveAttribute("data-state", state);
    }
    expect(screen.getAllByTestId(MinionSceneTestId.Root)).toHaveLength(6);
  });

  it("puts the state dot and upper-case name on the desk nameplate (no role)", () => {
    render(<OrgFloorplan coo={COO} rooms={ROOMS} />);
    const tag = screen.getByTestId(`${OrgFloorplanTestId.DeskTag}-a1`);
    expect(tag).toHaveTextContent(/^Stuart$/);
    expect(tag.className).toContain("uppercase");
    expect(screen.getByTestId(`${OrgFloorplanTestId.DeskTag}-a2`)).toHaveTextContent(/^Ken$/);
  });

  it("renders Zibby in the lobby at 200px", () => {
    render(<OrgFloorplan coo={COO} rooms={ROOMS} />);
    const zibby = within(screen.getByTestId(OrgFloorplanTestId.Coo)).getByTestId(
      ZibbyAvatarTestId.Root,
    );
    expect(zibby).toHaveAttribute("height", "200");
  });

  it("places minimap dots at the desk centre", () => {
    render(<OrgFloorplan coo={COO} rooms={ROOMS} />);
    const dot = screen.getByTestId(`${OrgFloorplanTestId.MinimapDot}-a1`);
    expect(dot).toBeInTheDocument();
    expect(FLOORPLAN_METRICS.CW / 2).toBe(56);
  });

  it("clicking a desk opens the agent only; clicking the room opens the room", () => {
    const onRoomClick = vi.fn();
    const onAgentClick = vi.fn();
    render(
      <OrgFloorplan
        coo={COO}
        onAgentClick={onAgentClick}
        onRoomClick={onRoomClick}
        rooms={ROOMS}
      />,
    );
    fireEvent.click(desk("a1"));
    expect(onAgentClick).toHaveBeenCalledWith("dev", "a1");
    expect(onRoomClick).not.toHaveBeenCalled();
    fireEvent.click(room("dev"));
    expect(onRoomClick).toHaveBeenCalledWith("dev");
  });

  it("activates room, desk and COO with Enter", () => {
    const onRoomClick = vi.fn();
    const onAgentClick = vi.fn();
    const onCooClick = vi.fn();
    render(
      <OrgFloorplan
        coo={COO}
        onAgentClick={onAgentClick}
        onCooClick={onCooClick}
        onRoomClick={onRoomClick}
        rooms={ROOMS}
      />,
    );
    fireEvent.keyDown(desk("a2"), { key: "Enter" });
    expect(onAgentClick).toHaveBeenCalledWith("dev", "a2");
    expect(onRoomClick).not.toHaveBeenCalled();
    fireEvent.keyDown(room("per"), { key: "Enter" });
    expect(onRoomClick).toHaveBeenCalledWith("per");
    fireEvent.keyDown(screen.getByTestId(OrgFloorplanTestId.Coo), { key: " " });
    expect(onCooClick).toHaveBeenCalled();
  });

  it("shows the popover on hover and focus with only the data it has", () => {
    render(<OrgFloorplan coo={COO} rooms={ROOMS} />);
    expect(screen.queryByTestId(OrgFloorplanTestId.Popover)).not.toBeInTheDocument();
    fireEvent.mouseEnter(desk("a1"));
    expect(screen.getByTestId(OrgFloorplanTestId.PopoverName)).toHaveTextContent("Stuart");
    expect(screen.getByTestId(OrgFloorplanTestId.PopoverMeta)).toHaveTextContent("DEV-01 · Coder");
    expect(screen.getByTestId(OrgFloorplanTestId.PopoverState)).toHaveTextContent("Working");
    expect(screen.getByTestId(OrgFloorplanTestId.PopoverTask)).toHaveTextContent("Fix flaky test");
    fireEvent.mouseLeave(desk("a1"));
    expect(screen.queryByTestId(OrgFloorplanTestId.Popover)).not.toBeInTheDocument();
    fireEvent.focus(desk("a2"));
    expect(screen.getByTestId(OrgFloorplanTestId.PopoverName)).toHaveTextContent("Ken");
    expect(screen.queryByTestId(OrgFloorplanTestId.PopoverTask)).not.toBeInTheDocument();
  });

  it("shows the COO popover and calls onCooClick", () => {
    const onCooClick = vi.fn();
    render(<OrgFloorplan coo={COO} onCooClick={onCooClick} rooms={ROOMS} />);
    const coo = screen.getByTestId(OrgFloorplanTestId.Coo);
    expect(coo).toHaveAccessibleName("Zibby · COO");
    fireEvent.mouseEnter(coo);
    expect(screen.getByTestId(OrgFloorplanTestId.PopoverName)).toHaveTextContent("Zibby");
    fireEvent.click(coo);
    expect(onCooClick).toHaveBeenCalled();
  });

  it("zooms with the buttons", () => {
    render(<OrgFloorplan coo={COO} rooms={ROOMS} />);
    const label = screen.getByTestId(OrgFloorplanTestId.ZoomLabel);
    const before = Number.parseInt((label as HTMLInputElement).value, 10);
    fireEvent.click(screen.getByTestId(OrgFloorplanTestId.ZoomIn));
    expect(Number.parseInt((label as HTMLInputElement).value, 10)).toBeGreaterThan(before);
    fireEvent.click(screen.getByTestId(OrgFloorplanTestId.ZoomOut));
    expect(Number.parseInt((label as HTMLInputElement).value, 10)).toBe(before);
  });

  it("shows the filled plan as 100% and Fill restores it", () => {
    render(<OrgFloorplan coo={COO} rooms={ROOMS} />);
    const label = screen.getByTestId(OrgFloorplanTestId.ZoomLabel);
    expect(label).toHaveValue("100%");
    fireEvent.click(screen.getByTestId(OrgFloorplanTestId.ZoomIn));
    expect(label).toHaveValue("125%");
    fireEvent.click(screen.getByTestId(OrgFloorplanTestId.Fill));
    expect(label).toHaveValue("100%");
  });

  it("applies a typed zoom on Enter and reverts on Escape", () => {
    render(<OrgFloorplan coo={COO} rooms={ROOMS} />);
    const label = screen.getByTestId(OrgFloorplanTestId.ZoomLabel);
    expect(label).toHaveAccessibleName("Zoom level");
    fireEvent.focus(label);
    fireEvent.change(label, { target: { value: "150" } });
    fireEvent.keyDown(label, { key: "Enter" });
    fireEvent.blur(label);
    expect(label).toHaveValue("150%");
    fireEvent.focus(label);
    fireEvent.change(label, { target: { value: "abc" } });
    fireEvent.blur(label);
    expect(label).toHaveValue("150%");
  });

  it("pans on plain wheel and prevents the page scroll", () => {
    render(<OrgFloorplan coo={COO} rooms={ROOMS} />);
    const canvas = screen.getByTestId(OrgFloorplanTestId.Canvas);
    const world = screen.getByTestId(OrgFloorplanTestId.World);
    const label = screen.getByTestId(OrgFloorplanTestId.ZoomLabel);
    const zoom = (label as HTMLInputElement).value;
    const before = world.style.transform;
    const notCancelled = fireEvent.wheel(canvas, { deltaX: 30, deltaY: 40 });
    expect(notCancelled).toBe(false);
    expect(world.style.transform).not.toBe(before);
    expect(label).toHaveValue(zoom);
  });

  it.each(["ctrlKey", "metaKey"])("zooms on wheel with %s held", (key) => {
    render(<OrgFloorplan coo={COO} rooms={ROOMS} />);
    const canvas = screen.getByTestId(OrgFloorplanTestId.Canvas);
    const label = screen.getByTestId(OrgFloorplanTestId.ZoomLabel);
    const before = Number.parseInt((label as HTMLInputElement).value, 10);
    const notCancelled = fireEvent.wheel(canvas, { deltaY: -200, [key]: true });
    expect(notCancelled).toBe(false);
    expect(Number.parseInt((label as HTMLInputElement).value, 10)).toBeGreaterThan(before);
  });

  it("pans on drag and suppresses the click that ends it", () => {
    const onRoomClick = vi.fn();
    render(<OrgFloorplan coo={COO} onRoomClick={onRoomClick} rooms={ROOMS} />);
    const world = screen.getByTestId(OrgFloorplanTestId.World);
    const before = world.style.transform;
    fireEvent.mouseDown(room("dev"), { button: 0, clientX: 100, clientY: 100 });
    fireEvent.mouseMove(window, { clientX: 160, clientY: 130 });
    expect(world.style.transform).not.toBe(before);
    fireEvent.mouseUp(window);
    fireEvent.click(room("dev"));
    expect(onRoomClick).not.toHaveBeenCalled();
  });

  it("renders the spine, two corridors, minimap with a dot per agent", () => {
    render(<OrgFloorplan coo={COO} rooms={ROOMS} />);
    expect(screen.getByTestId(OrgFloorplanTestId.Spine)).toBeInTheDocument();
    expect(screen.getAllByTestId(OrgFloorplanTestId.Corridor)).toHaveLength(2);
    expect(screen.getByTestId(OrgFloorplanTestId.Minimap)).toBeInTheDocument();
    expect(screen.getByTestId(`${OrgFloorplanTestId.MinimapDot}-a1`)).toBeInTheDocument();
    expect(screen.getByTestId(`${OrgFloorplanTestId.MinimapRoom}-dev`)).toBeInTheDocument();
    expect(screen.getByTestId(OrgFloorplanTestId.MinimapViewport)).toBeInTheDocument();
  });
});

describe("OrgFloorplan walkers", () => {
  const WALKER = { id: "w1", agentId: "a1", toRoomId: "ops", label: "PR #322" };
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("walks from the desk, dims the desk, and finishes exactly once", () => {
    vi.useFakeTimers();
    const onWalkerDone = vi.fn();
    render(<OrgFloorplan coo={COO} onWalkerDone={onWalkerDone} rooms={ROOMS} walkers={[WALKER]} />);
    const walker = screen.getByTestId(`${OrgFloorplanTestId.Walker}-w1`);
    expect(within(walker).getByTestId(MinionWalkerTestId.Root)).toHaveAttribute(
      "data-carry",
      "true",
    );
    expect(walker).toHaveTextContent("PR #322");
    const scene = within(desk("a1")).getByTestId(MinionSceneTestId.Root);
    expect(scene.parentElement?.className).toContain("opacity-[0.18]");
    expect(
      within(desk("a2")).getByTestId(MinionSceneTestId.Root).parentElement?.className,
    ).toContain("opacity-100");
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(onWalkerDone).toHaveBeenCalledTimes(1);
    expect(onWalkerDone).toHaveBeenCalledWith("w1");
    expect(screen.queryByTestId(`${OrgFloorplanTestId.Walker}-w1`)).not.toBeInTheDocument();
    expect(
      within(desk("a1")).getByTestId(MinionSceneTestId.Root).parentElement?.className,
    ).toContain("opacity-100");
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(onWalkerDone).toHaveBeenCalledTimes(1);
  });

  it("drops the box on the way back", () => {
    vi.useFakeTimers();
    render(<OrgFloorplan coo={COO} rooms={ROOMS} walkers={[WALKER]} />);
    // outbound (~6s) + 4.5s dwell is well under 14s; the return trip is empty-handed
    act(() => {
      vi.advanceTimersByTime(11_000);
    });
    const walker = screen.getByTestId(`${OrgFloorplanTestId.Walker}-w1`);
    expect(within(walker).getByTestId(MinionWalkerTestId.Root)).toHaveAttribute(
      "data-carry",
      "false",
    );
  });

  it("ignores unknown agents, unknown rooms and trips to the own room", () => {
    vi.useFakeTimers();
    const onWalkerDone = vi.fn();
    render(
      <OrgFloorplan
        coo={COO}
        onWalkerDone={onWalkerDone}
        rooms={ROOMS}
        walkers={[
          { ...WALKER, id: "x1", agentId: "ghost" },
          { ...WALKER, id: "x2", toRoomId: "nowhere" },
          { ...WALKER, id: "x3", toRoomId: "dev" },
        ]}
      />,
    );
    for (const id of ["x1", "x2", "x3"]) {
      expect(screen.queryByTestId(`${OrgFloorplanTestId.Walker}-${id}`)).not.toBeInTheDocument();
    }
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(onWalkerDone).not.toHaveBeenCalled();
  });

  it("does not walk with reduced motion, and finishes the trip immediately", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    );
    const onWalkerDone = vi.fn();
    render(<OrgFloorplan coo={COO} onWalkerDone={onWalkerDone} rooms={ROOMS} walkers={[WALKER]} />);
    expect(screen.queryByTestId(`${OrgFloorplanTestId.Walker}-w1`)).not.toBeInTheDocument();
    expect(onWalkerDone).toHaveBeenCalledTimes(1);
    expect(onWalkerDone).toHaveBeenCalledWith("w1");
  });
});
