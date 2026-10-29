import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders as render, screen } from "../../../test/render";
import {
  CompanyRoadmapDefaultsPanel,
  CompanyRoadmapDefaultsTestId as TestId,
} from "./CompanyRoadmapDefaultsPanel";

const { hooks } = vi.hoisted(() => ({ hooks: { mutate: vi.fn() } }));
vi.mock("../mutations", () => ({
  useUpdateCompanyMutation: () => ({ mutate: hooks.mutate, isPending: false }),
}));

describe("CompanyRoadmapDefaultsPanel", () => {
  beforeEach(() => hooks.mutate.mockReset());

  it("writes the whole roadmapDefaults object so the sibling toggle is kept", async () => {
    render(
      <CompanyRoadmapDefaultsPanel
        company={{ id: "shoptet", name: "Shoptet", roadmapDefaults: { autoPlay: true } }}
      />,
    );

    await userEvent.click(screen.getByTestId(TestId.AutoReview));

    expect(hooks.mutate).toHaveBeenCalledWith({
      params: { id: "shoptet" },
      body: { roadmapDefaults: { autoPlay: true, autoReview: true } },
    });
  });

  it.each([
    [TestId.AutoReview, "autoReview"],
    [TestId.AutoAddressComments, "autoAddressComments"],
  ] as const)("the %s switch writes its key next to the existing defaults", async (testId, key) => {
    render(
      <CompanyRoadmapDefaultsPanel
        company={{ id: "shoptet", name: "Shoptet", roadmapDefaults: { autoPlay: true } }}
      />,
    );

    await userEvent.click(screen.getByTestId(testId));

    expect(hooks.mutate).toHaveBeenCalledWith({
      params: { id: "shoptet" },
      body: { roadmapDefaults: { autoPlay: true, [key]: true } },
    });
  });
});
