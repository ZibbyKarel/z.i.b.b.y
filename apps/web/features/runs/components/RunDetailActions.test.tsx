import { renderWithProviders as render, screen, within } from "../../../test/render";
import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { IconTestId, MenuButtonTestId } from "@zibby/design-system";
import type { RunView } from "../run";
import type { RunMode } from "../runDetailModel";
import { RunDetailActions, RunDetailActionsTestId } from "./RunDetailActions";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const baseRun: RunView = {
  runId: "delivery_42",
  kind: "workflow",
  owner: "delivery",
  status: "running",
  pct: null,
  title: "Fix login",
  prompt: "",
  project: "",
  startedAt: "2026-10-20T10:00:00Z",
  logBase: null,
  taskId: "T-1",
  stageRuns: [],
};

function renderActions(mode: RunMode, run: Partial<RunView> = {}, handlers = {}) {
  const props = {
    onPause: vi.fn(),
    onResume: vi.fn(),
    onStop: vi.fn(),
    onDelete: vi.fn(),
    onContinueTask: vi.fn(),
    ...handlers,
  };
  render(
    <RunDetailActions
      currentStageName="coder"
      mode={mode}
      onOpenFolder={vi.fn()}
      pending={false}
      run={{ ...baseRun, ...run }}
      {...props}
    />,
  );
  return props;
}

const actionIds = () =>
  within(screen.getByTestId(RunDetailActionsTestId.Root))
    .queryAllByTestId(new RegExp(`^${RunDetailActionsTestId.Action}-`))
    .map((el) => el.getAttribute("data-testid")?.slice(RunDetailActionsTestId.Action.length + 1));

describe("RunDetailActions", () => {
  it.each<[RunMode, Partial<RunView>, string[]]>([
    ["running", {}, ["pause", "stop"]],
    ["running", { kind: "agent" }, ["stop"]],
    ["pausing", {}, ["pausing", "resume", "stop"]],
    ["paused", {}, ["resume", "stop"]],
    ["approval", {}, ["pause", "stop"]],
    ["approval", { kind: "agent" }, ["stop"]],
    ["question", {}, ["pause", "stop"]],
    ["question", { kind: "agent" }, ["stop"]],
    ["parked", {}, ["rerunFresh", "continueSession"]],
    ["stopped", {}, ["rerunFresh", "continueSession"]],
    ["error", { kind: "agent", sessionId: "s1" }, ["rerunFresh", "continueSession"]],
    ["error", { kind: "agent" }, ["rerunFresh"]],
    ["done", {}, ["rerun", "continueTask"]],
    ["waiting", { kind: "scheduled", status: "queued" }, ["stop"]],
    ["waiting", { kind: "scheduled", status: "pending" }, []],
    ["limit", { status: "paused-limit" }, ["stop"]],
    ["limit", { kind: "goal", status: "paused-limit" }, []],
  ])("%s %o → %o", (mode, run, expected) => {
    renderActions(mode, run);
    expect(actionIds()).toEqual(expected);
  });

  it("stop confirms before calling onStop", async () => {
    const { onStop } = renderActions("running");
    await userEvent.click(screen.getByTestId(`${RunDetailActionsTestId.Action}-stop`));
    expect(onStop).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Zastavit delivery_42")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Zastavit" }));
    expect(onStop).toHaveBeenCalledOnce();
  });

  it("re-run fresh and continue session pass the resume mode", async () => {
    const { onResume } = renderActions("stopped");
    await userEvent.click(screen.getByTestId(`${RunDetailActionsTestId.Action}-rerunFresh`));
    expect(onResume).toHaveBeenLastCalledWith({ mode: "fresh" });
    await userEvent.click(screen.getByTestId(`${RunDetailActionsTestId.Action}-continueSession`));
    expect(onResume).toHaveBeenLastCalledWith({ mode: "continue" });
  });

  it("the ··· menu offers delete only in terminal/waiting modes", async () => {
    renderActions("done");
    await userEvent.click(screen.getByTestId(MenuButtonTestId.Trigger));
    expect(screen.getByTestId(`${MenuButtonTestId.Item}-openTask`)).toBeInTheDocument();
    expect(screen.getByTestId(`${MenuButtonTestId.Item}-openFolder`)).toBeInTheDocument();
    expect(screen.getByTestId(`${MenuButtonTestId.Item}-copyId`)).toBeInTheDocument();
    expect(screen.getByTestId(`${MenuButtonTestId.Item}-delete`)).toBeInTheDocument();
  });

  it("a parked workflow's ··· menu offers STOP (with its icon), confirmed before onStop", async () => {
    const { onStop } = renderActions("parked", { status: "parked" });
    await userEvent.click(screen.getByTestId(MenuButtonTestId.Trigger));
    const item = screen.getByTestId(`${MenuButtonTestId.Item}-stop`);
    expect(within(item).getByTestId(IconTestId.Root)).toHaveAttribute("data-icon", "stop");
    await userEvent.click(item);
    await userEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Zastavit" }),
    );
    expect(onStop).toHaveBeenCalledOnce();
  });

  it("the ··· menu does not repeat pause/stop already shown as buttons", async () => {
    renderActions("running");
    await userEvent.click(screen.getByTestId(MenuButtonTestId.Trigger));
    expect(screen.queryByTestId(`${MenuButtonTestId.Item}-stop`)).not.toBeInTheDocument();
    expect(screen.queryByTestId(`${MenuButtonTestId.Item}-pause`)).not.toBeInTheDocument();
  });

  it("the ··· menu offers HAND OVER on a finished/stuck run and calls onHandover", async () => {
    const onHandover = vi.fn();
    renderActions("parked", { status: "parked" }, { onHandover });
    await userEvent.click(screen.getByTestId(MenuButtonTestId.Trigger));
    await userEvent.click(screen.getByTestId(`${MenuButtonTestId.Item}-handover`));
    expect(onHandover).toHaveBeenCalledOnce();
  });

  it("no HAND OVER while the run is still running", async () => {
    renderActions("running", {}, { onHandover: vi.fn() });
    await userEvent.click(screen.getByTestId(MenuButtonTestId.Trigger));
    expect(screen.queryByTestId(`${MenuButtonTestId.Item}-handover`)).not.toBeInTheDocument();
  });

  it("no delete while running", async () => {
    renderActions("running");
    await userEvent.click(screen.getByTestId(MenuButtonTestId.Trigger));
    expect(screen.queryByTestId(`${MenuButtonTestId.Item}-delete`)).not.toBeInTheDocument();
  });

  it("delete confirms before calling onDelete", async () => {
    const { onDelete } = renderActions("error");
    await userEvent.click(screen.getByTestId(MenuButtonTestId.Trigger));
    await userEvent.click(screen.getByTestId(`${MenuButtonTestId.Item}-delete`));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Smazat delivery_42")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Smazat běh" }));
    expect(onDelete).toHaveBeenCalledOnce();
  });
});
