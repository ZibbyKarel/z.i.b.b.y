import { describe, expect, it, vi } from "vitest";
import type { CiStatus } from "@zibby/contracts";
import { TagTestId } from "@zibby/design-system";
import { within } from "@testing-library/react";
import { renderWithProviders as render, screen } from "../../../test/render";
import { ProjectCiStatusChip, ProjectCiStatusChipTestId } from "./ProjectCiStatusChip";

const status = (over: Partial<CiStatus>): CiStatus => ({
  integrationId: "acme-github",
  projectId: "acme",
  adapterKind: "github-ci",
  state: "red",
  sinceAt: "2026-07-02T08:00:00.000Z",
  checkedAt: "2026-07-02T08:12:00.000Z",
  summary: "build.yml failed on main",
  ...over,
});

const mockData = vi.fn();
vi.mock("../queries", () => ({
  useCiStatusQuery: () => mockData(),
}));

describe("ProjectCiStatusChip (N4b)", () => {
  it("renders nothing for a project without a watched CI", () => {
    mockData.mockReturnValue({ data: [] });
    render(<ProjectCiStatusChip projectId="acme" />);
    expect(screen.queryByTestId(ProjectCiStatusChipTestId.Chip)).toBeNull();
  });

  it("red: three indicators — bad tone, x glyph, text with the since time", () => {
    mockData.mockReturnValue({ data: [status({})] });
    render(<ProjectCiStatusChip projectId="acme" />);
    const chip = screen.getByTestId(ProjectCiStatusChipTestId.Chip);
    // Text carries the state and the "since HH:MM" — never colour alone.
    expect(chip).toHaveTextContent(/CI červené od \d{1,2}[:.]\d{2}/);
    expect(chip).toHaveAttribute("title", "build.yml failed on main");
    expect(within(chip).getByTestId(TagTestId.Icon)).toBeInTheDocument();
  });

  it("green: reads green with no since time", () => {
    mockData.mockReturnValue({ data: [status({ state: "green" })] });
    render(<ProjectCiStatusChip projectId="acme" />);
    expect(screen.getByTestId(ProjectCiStatusChipTestId.Chip)).toHaveTextContent("CI zelené");
  });
});
