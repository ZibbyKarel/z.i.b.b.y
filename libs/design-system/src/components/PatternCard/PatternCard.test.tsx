import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PatternCard, PatternCardTestId } from "./PatternCard";

describe("PatternCard", () => {
  it("renders scope, rule and evidence label", () => {
    render(
      <PatternCard
        evidence={["done", "error"]}
        evidenceLabel="1 / 2"
        rule="Always run lint before push."
        scope="API · PROPOSED"
      />,
    );
    expect(screen.getByTestId(PatternCardTestId.Scope)).toHaveTextContent("API · PROPOSED");
    expect(screen.getByTestId(PatternCardTestId.Rule)).toHaveTextContent(
      "Always run lint before push.",
    );
    expect(screen.getByTestId(PatternCardTestId.Status)).toHaveTextContent("1 / 2");
  });

  it("fires onAccept / onDismiss and omits actions when both are absent", () => {
    const onAccept = vi.fn();
    const onDismiss = vi.fn();
    render(
      <PatternCard
        evidence={["done"]}
        evidenceLabel="NOW A RULE"
        onAccept={onAccept}
        onDismiss={onDismiss}
        rule="Rule text"
        scope="GLOBAL"
      />,
    );
    screen.getByTestId(PatternCardTestId.Accept).click();
    screen.getByTestId(PatternCardTestId.Dismiss).click();
    expect(onAccept).toHaveBeenCalledOnce();
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("renders no action buttons when neither handler is given", () => {
    render(<PatternCard evidence={["done"]} evidenceLabel="NOW A RULE" rule="Rule" scope="X" />);
    expect(screen.queryByTestId(PatternCardTestId.Accept)).toBeNull();
    expect(screen.queryByTestId(PatternCardTestId.Dismiss)).toBeNull();
  });
});
