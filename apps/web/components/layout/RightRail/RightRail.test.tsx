import { describe, expect, it } from "vitest";
import { renderWithProviders, screen } from "../../../test/render";
import { RightRail } from "./RightRail";

describe("RightRail", () => {
  it("renders the live activity log header and empty state", () => {
    // No live API under test, so the feed query stays pending and the rail shows
    // its title + empty state — enough to assert the log is wired up. (Approvals
    // moved to the Overview page; the rail is now a pure log.)
    renderWithProviders(<RightRail />);
    expect(screen.getByText("Živý log")).toBeInTheDocument();
    expect(screen.getByText("Zatím žádná aktivita.")).toBeInTheDocument();
  });
});
