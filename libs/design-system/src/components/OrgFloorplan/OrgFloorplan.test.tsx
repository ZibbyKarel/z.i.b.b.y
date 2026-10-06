import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
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

  it("dashes the personal room and gives the ops room the page background", () => {
    render(<OrgFloorplan coo={COO} rooms={ROOMS} />);
    expect(room("per").className).toContain("border-dashed");
    expect(room("ops").className).toContain("bg-bg");
    expect(room("dev").className).not.toContain("border-dashed");
  });

  it("badges error/blocked/done desks, rings error/blocked, nothing otherwise", () => {
    render(<OrgFloorplan coo={COO} rooms={ROOMS} />);
    expect(screen.getByTestId(`${OrgFloorplanTestId.DeskBadge}-a2`)).toHaveTextContent("!");
    expect(screen.getByTestId(`${OrgFloorplanTestId.DeskBadge}-a3`)).toHaveTextContent("?");
    expect(screen.getByTestId(`${OrgFloorplanTestId.DeskBadge}-a4`)).toHaveTextContent("✓");
    expect(screen.queryByTestId(`${OrgFloorplanTestId.DeskBadge}-a1`)).not.toBeInTheDocument();
    expect(screen.queryByTestId(`${OrgFloorplanTestId.DeskBadge}-a5`)).not.toBeInTheDocument();
    expect(screen.getByTestId(`${OrgFloorplanTestId.DeskRing}-a2`).style.animation).toContain(
      "zb-ring 0.8s",
    );
    expect(screen.getByTestId(`${OrgFloorplanTestId.DeskRing}-a3`).style.animation).toContain(
      "zb-ring 1.2s",
    );
    expect(screen.queryByTestId(`${OrgFloorplanTestId.DeskRing}-a1`)).not.toBeInTheDocument();
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
