import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { render } from "../../utils/testRender";
import { GoalCard, GoalCardTestId } from "./GoalCard";

describe("GoalCard", () => {
  it("renders identity, state, title, maker/verifier and the budget caption", () => {
    render(
      <GoalCard
        eyebrow="ship-feature · CLIENT-PORTAL"
        makerLabel="delivery"
        max={10}
        state="working"
        title="Ship feature Y green"
        used={3}
        verifierLabel="checks"
      />,
    );
    expect(screen.getByTestId(GoalCardTestId.Eyebrow)).toHaveTextContent(
      "ship-feature · CLIENT-PORTAL",
    );
    expect(screen.getByTestId(GoalCardTestId.Title)).toHaveTextContent("Ship feature Y green");
    expect(screen.getByTestId(GoalCardTestId.Maker)).toHaveTextContent("delivery");
    expect(screen.getByTestId(GoalCardTestId.Verifier)).toHaveTextContent("checks");
    expect(screen.getByTestId(GoalCardTestId.BudgetCaption)).toHaveTextContent("3 / 10 RUNS");
  });

  it("renders the iteration summary only when provided", () => {
    const { rerender } = render(
      <GoalCard
        eyebrow="e"
        makerLabel="m"
        max={5}
        state="idle"
        title="t"
        used={0}
        verifierLabel="v"
      />,
    );
    expect(screen.queryByTestId(GoalCardTestId.IterationSummary)).toBeNull();

    rerender(
      <GoalCard
        eyebrow="e"
        iterationSummary="Iteration 2 · verifier failed"
        makerLabel="m"
        max={5}
        state="idle"
        title="t"
        used={2}
        verifierLabel="v"
      />,
    );
    expect(screen.getByTestId(GoalCardTestId.IterationSummary)).toHaveTextContent(
      "Iteration 2 · verifier failed",
    );
  });

  it("renders resume/stop/open only when their handlers are provided", () => {
    const { rerender } = render(
      <GoalCard
        eyebrow="e"
        makerLabel="m"
        max={5}
        state="idle"
        title="t"
        used={0}
        verifierLabel="v"
      />,
    );
    expect(screen.queryByTestId(GoalCardTestId.Resume)).toBeNull();
    expect(screen.queryByTestId(GoalCardTestId.Stop)).toBeNull();
    expect(screen.queryByTestId(GoalCardTestId.Open)).toBeNull();

    const onResume = vi.fn();
    const onStop = vi.fn();
    const onOpen = vi.fn();
    rerender(
      <GoalCard
        eyebrow="e"
        makerLabel="m"
        max={5}
        onOpen={onOpen}
        onResume={onResume}
        onStop={onStop}
        state="blocked"
        title="t"
        used={5}
        verifierLabel="v"
      />,
    );
    expect(screen.getByTestId(GoalCardTestId.Resume)).toBeInTheDocument();
    expect(screen.getByTestId(GoalCardTestId.Stop)).toBeInTheDocument();
    expect(screen.getByTestId(GoalCardTestId.Open)).toBeInTheDocument();
  });

  it("fires onResume/onStop/onOpen", async () => {
    const onResume = vi.fn();
    const onStop = vi.fn();
    const onOpen = vi.fn();
    render(
      <GoalCard
        eyebrow="e"
        makerLabel="m"
        max={5}
        onOpen={onOpen}
        onResume={onResume}
        onStop={onStop}
        state="blocked"
        title="t"
        used={5}
        verifierLabel="v"
      />,
    );
    await userEvent.click(screen.getByTestId(GoalCardTestId.Resume));
    await userEvent.click(screen.getByTestId(GoalCardTestId.Stop));
    await userEvent.click(screen.getByTestId(GoalCardTestId.Open));
    expect(onResume).toHaveBeenCalledOnce();
    expect(onStop).toHaveBeenCalledOnce();
    expect(onOpen).toHaveBeenCalledOnce();
  });
});
