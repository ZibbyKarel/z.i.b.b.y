import userEvent from "@testing-library/user-event";
import type { Company } from "@zibby/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders as render, screen } from "../../../test/render";
import {
  CompanyLevelMappingPanel,
  CompanyLevelMappingTestId as TestId,
} from "./CompanyLevelMappingPanel";

const { hooks } = vi.hoisted(() => ({
  hooks: { mutate: vi.fn() },
}));

vi.mock("../../roadmap/queries", () => ({
  useLevelMappingQuery: () => ({
    isPending: false,
    isError: false,
    data: {
      entries: [
        { kind: "jira", externalLevel: "Story", target: "task" },
        { kind: "jira", externalLevel: "Epic", target: "epic" },
      ],
    },
  }),
}));
vi.mock("../mutations", () => ({
  useUpdateCompanyMutation: () => ({ mutate: hooks.mutate, isPending: false }),
}));

const company = (entries: NonNullable<Company["levelMapping"]>["entries"] = []): Company => ({
  id: "shoptet",
  name: "Shoptet",
  levelMapping: { entries },
});

describe("CompanyLevelMappingPanel", () => {
  beforeEach(() => hooks.mutate.mockReset());

  it("shows the global value per row and disables reset when nothing is overridden", () => {
    render(<CompanyLevelMappingPanel company={company()} />);

    expect(screen.getByTestId(`${TestId.Global}-jira:story`)).toHaveTextContent(/task|úloha/i);
    expect(screen.getByTestId(`${TestId.Reset}-jira:story`)).toBeDisabled();
  });

  it("reset to global removes only that entry from the company document", async () => {
    render(
      <CompanyLevelMappingPanel
        company={company([
          { kind: "jira", externalLevel: "story", target: "epic" },
          { kind: "jira", externalLevel: "Epic", target: "ignore" },
        ])}
      />,
    );

    await userEvent.click(screen.getByTestId(`${TestId.Reset}-jira:story`));

    expect(hooks.mutate).toHaveBeenCalledWith({
      params: { id: "shoptet" },
      body: {
        levelMapping: { entries: [{ kind: "jira", externalLevel: "Epic", target: "ignore" }] },
      },
    });
  });
});
