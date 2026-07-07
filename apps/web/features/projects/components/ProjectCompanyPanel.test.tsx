import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { DropdownTestId } from "@zibby/design-system";
import type { Company, Integration, ProjectPerson, ResolvedProjectContext } from "@zibby/contracts";
import { renderWithProviders as render, screen } from "../../../test/render";
import { ProjectCompanyPanel, ProjectCompanyPanelTestId } from "./ProjectCompanyPanel";

const companies: Company[] = [
  { id: "acme", name: "Acme Corp" },
  { id: "globex", name: "Globex" },
];

const updateProjectMutate = vi.fn();

let resolvedData: ResolvedProjectContext = { people: [], integrations: [] };

vi.mock("../../companies", () => ({
  useCompaniesQuery: () => ({ data: companies }),
}));

vi.mock("../mutations", () => ({
  useUpdateProjectMutation: () => ({ mutate: updateProjectMutate, isPending: false }),
}));

vi.mock("../queries", () => ({
  useResolvedProjectQuery: () => ({ data: resolvedData }),
}));

describe("ProjectCompanyPanel", () => {
  it("shows the company-less project's own data with no 'merged' claim", () => {
    resolvedData = {
      people: [{ name: "Bob", role: "Engineer" }],
      integrations: [],
    };
    render(<ProjectCompanyPanel projectId="solo" />);
    expect(screen.getByTestId(ProjectCompanyPanelTestId.EffectiveNote)).toHaveTextContent(
      "Bez napojené firmy",
    );
    expect(screen.getByText("Bob")).toBeInTheDocument();
  });

  it("renders the merged people/budget/integrations from the resolved query", () => {
    const people: ProjectPerson[] = [
      { id: "alice", name: "Alice", role: "CEO" },
      { id: "bob", name: "Bob", role: "Engineer" },
    ];
    const integrations: Integration[] = [
      {
        id: "co-jira",
        kind: "jira",
        companyId: "acme",
        name: "Company Jira",
        enabled: true,
        status: "connected",
        hasCredentials: false,
        config: { kind: "jira", baseUrl: "https://acme.atlassian.net", email: "ops@acme.com" },
      },
    ];
    resolvedData = {
      people,
      budget: { dailyRuns: 3, weeklyRuns: 50 },
      integrations,
      companyId: "acme",
      companyName: "Acme Corp",
    };
    render(<ProjectCompanyPanel companyId="acme" projectId="linked" />);

    expect(screen.getByTestId(ProjectCompanyPanelTestId.EffectiveNote)).toHaveTextContent(
      "Acme Corp",
    );
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.getByText("Company Jira")).toBeInTheDocument();
  });

  it("sets companyId via the update mutation when a company is picked", async () => {
    resolvedData = { people: [], integrations: [] };
    updateProjectMutate.mockReset();
    const user = userEvent.setup();
    render(<ProjectCompanyPanel projectId="solo" />);

    await user.click(screen.getByTestId(DropdownTestId.Trigger));
    const options = screen.getAllByTestId(DropdownTestId.Option);
    const globexOption = options.find((o) => o.textContent === "Globex");
    await user.click(globexOption!);

    expect(updateProjectMutate).toHaveBeenCalledWith({
      params: { id: "solo" },
      body: { companyId: "globex" },
    });
  });

  it("clears companyId (sends null) when 'no company' is picked", async () => {
    resolvedData = { people: [], integrations: [], companyId: "acme", companyName: "Acme Corp" };
    updateProjectMutate.mockReset();
    const user = userEvent.setup();
    render(<ProjectCompanyPanel companyId="acme" projectId="linked" />);

    await user.click(screen.getByTestId(DropdownTestId.Trigger));
    const options = screen.getAllByTestId(DropdownTestId.Option);
    const noCompanyOption = options.find((o) => o.textContent === "Bez firmy");
    await user.click(noCompanyOption!);

    expect(updateProjectMutate).toHaveBeenCalledWith({
      params: { id: "linked" },
      body: { companyId: null },
    });
  });
});
