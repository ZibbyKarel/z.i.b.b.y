import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LoadingScreen, LoadingScreenTestId } from "./LoadingScreen";

describe("LoadingScreen", () => {
  it("renders the brand mark slot", () => {
    render(<LoadingScreen logo={<span>mark</span>} progress={0} />);
    expect(screen.getByTestId(LoadingScreenTestId.Logo)).toHaveTextContent("mark");
  });

  it("splits the wordmark into characters", () => {
    render(<LoadingScreen logo={null} progress={0} wordmark="Z.Y" />);
    const wordmark = screen.getByTestId(LoadingScreenTestId.Wordmark);
    expect(wordmark).toHaveTextContent("Z.Y");
    // One span per character (Z, ., Y).
    expect(wordmark.querySelectorAll("span")).toHaveLength(3);
  });

  it("exposes a labelled progressbar clamped to 0–100", () => {
    render(<LoadingScreen logo={null} progress={150} status="Working" />);
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "100");
  });

  it("renders the status, tagline and version when provided", () => {
    render(
      <LoadingScreen
        logo={null}
        progress={50}
        status="Booting"
        tagline="Tagline here"
        version="v1.0"
      />,
    );
    expect(screen.getByTestId(LoadingScreenTestId.Status)).toHaveTextContent("Booting");
    expect(screen.getByTestId(LoadingScreenTestId.Tagline)).toHaveTextContent("Tagline here");
    expect(screen.getByTestId(LoadingScreenTestId.Version)).toHaveTextContent("v1.0");
  });

  it("plays the exit fade when done", () => {
    render(<LoadingScreen done logo={null} progress={100} />);
    expect(screen.getByTestId(LoadingScreenTestId.Root)).toHaveClass("animate-screen-out");
  });
});
