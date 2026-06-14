import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { DesignSystemProvider } from "@zibby/design-system";
import { LoadError, LoadErrorTestId } from "./LoadError";

const renderLoadError = (props: Parameters<typeof LoadError>[0]) =>
  render(
    <DesignSystemProvider>
      <LoadError {...props} />
    </DesignSystemProvider>,
  );

describe("LoadError (40) — honest couldn't-load state", () => {
  it("renders the title + description", () => {
    renderLoadError({ title: "Couldn't load agents", description: "API unreachable." });
    expect(screen.getByText("Couldn't load agents")).toBeInTheDocument();
    expect(screen.getByText("API unreachable.")).toBeInTheDocument();
  });

  it("calls onRetry when the retry button is pressed", async () => {
    const onRetry = vi.fn();
    renderLoadError({
      title: "Couldn't load",
      description: "x",
      retryLabel: "Try again",
      onRetry,
    });
    await userEvent.click(screen.getByTestId(LoadErrorTestId.Retry));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("shows no retry button when onRetry is absent", () => {
    renderLoadError({ title: "Couldn't load", description: "x" });
    expect(screen.queryByTestId(LoadErrorTestId.Retry)).not.toBeInTheDocument();
  });
});
