import { renderWithProviders as render, screen } from "../../test/render";
import { describe, expect, it } from "vitest";
import { ModelBadge, ThinkBadge } from "./RuntimeBadges";

describe("RuntimeBadges (39) — shared model/thinking tags", () => {
  it("ModelBadge renders the model name", () => {
    render(<ModelBadge model="sonnet" />);
    expect(screen.getByText("sonnet")).toBeInTheDocument();
  });

  it("ThinkBadge renders the thinking level", () => {
    render(<ThinkBadge level="high" />);
    expect(screen.getByText(/high/)).toBeInTheDocument();
  });
});
