import userEvent from "@testing-library/user-event";
import type { Integration, IntegrationRoutingRule } from "@zibby/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders as render, screen } from "../../../test/render";
import {
  ProjectInheritedIntegrations,
  ProjectInheritedIntegrationsTestId as TestId,
} from "./ProjectInheritedIntegrations";
import { IntegrationRoutingEditorTestId } from "./IntegrationRoutingEditor";

const { hooks } = vi.hoisted(() => ({
  hooks: {
    resolved: { data: undefined as unknown },
    update: { mutate: vi.fn(), isPending: false },
  },
}));

vi.mock("../queries", () => ({ useResolvedProjectQuery: () => hooks.resolved }));
vi.mock("../mutations", () => ({ useUpdateProjectMutation: () => hooks.update }));

const jira: Integration = {
  id: "jira-shoptet",
  kind: "jira",
  name: "Shoptet Jira",
  companyId: "shoptet",
  enabled: true,
  status: "connected",
  hasCredentials: true,
  config: { kind: "jira", baseUrl: "https://shoptet.atlassian.net", email: "a@b.cz" },
} as Integration;
const github: Integration = {
  id: "gh-shoptet",
  kind: "github",
  companyId: "shoptet",
  enabled: true,
  status: "connected",
  hasCredentials: true,
  config: { kind: "github", repo: "shoptet/cli", streams: ["issues"], username: "me" },
} as Integration;
const own: Integration = {
  ...jira,
  id: "own",
  companyId: undefined,
  projectId: "p1",
} as Integration;

function resolved(integrations: Integration[]) {
  hooks.resolved = {
    data: { people: [], integrations, companyId: "shoptet", companyName: "Shoptet" },
  };
}

const slackRule: IntegrationRoutingRule = {
  integrationId: "other",
  match: { kind: "slack", channels: ["C1"] },
};

describe("ProjectInheritedIntegrations", () => {
  beforeEach(() => {
    hooks.update = { mutate: vi.fn(), isPending: false };
    resolved([jira]);
  });

  it("renders only company-owned integrations, badged and linked to the company", () => {
    resolved([jira, own]);
    render(<ProjectInheritedIntegrations onOverride={vi.fn()} projectId="p1" routing={[]} />);

    expect(screen.getAllByTestId(TestId.FromCompanyBadge)).toHaveLength(1);
    expect(screen.getByTestId(TestId.FromCompanyBadge)).toHaveTextContent("Shoptet");
    expect(screen.getByTestId(TestId.CompanyLink)).toHaveAttribute(
      "href",
      "/companies/shoptet?tab=integrations",
    );
    expect(screen.queryByTestId(`${TestId.Row}-own`)).not.toBeInTheDocument();
  });

  it("renders nothing when the project inherits no integration", () => {
    resolved([own]);
    render(<ProjectInheritedIntegrations onOverride={vi.fn()} projectId="p1" routing={[]} />);
    expect(screen.queryByTestId(TestId.Root)).not.toBeInTheDocument();
  });

  it("override opens the create flow with the same kind", async () => {
    const onOverride = vi.fn();
    render(<ProjectInheritedIntegrations onOverride={onOverride} projectId="p1" routing={[]} />);

    await userEvent.click(screen.getByTestId(`${TestId.Override}-jira-shoptet`));

    expect(onOverride).toHaveBeenCalledWith("jira");
  });

  it("saves a jira rule into integrationRouting, keeping other integrations' rules", async () => {
    render(
      <ProjectInheritedIntegrations onOverride={vi.fn()} projectId="p1" routing={[slackRule]} />,
    );

    await userEvent.type(screen.getByTestId(IntegrationRoutingEditorTestId.ProjectKey), "CMS");
    await userEvent.click(screen.getByTestId(IntegrationRoutingEditorTestId.Save));

    expect(hooks.update.mutate).toHaveBeenCalledWith({
      params: { id: "p1" },
      body: {
        integrationRouting: [
          slackRule,
          { integrationId: "jira-shoptet", match: { kind: "jira", projectKey: "CMS" } },
        ],
      },
    });
  });

  it("clearing a rule drops only that integration's rule", async () => {
    const mine: IntegrationRoutingRule = {
      integrationId: "jira-shoptet",
      match: { kind: "jira", projectKey: "CMS" },
    };
    render(
      <ProjectInheritedIntegrations
        onOverride={vi.fn()}
        projectId="p1"
        routing={[slackRule, mine]}
      />,
    );

    await userEvent.click(screen.getByTestId(IntegrationRoutingEditorTestId.Clear));

    expect(hooks.update.mutate).toHaveBeenCalledWith({
      params: { id: "p1" },
      body: { integrationRouting: [slackRule] },
    });
  });

  it("github shows the git-remote routing text and no editor; the switch writes the implicit rule", async () => {
    resolved([github]);
    render(
      <ProjectInheritedIntegrations
        gitRemote="git@github.com:Shoptet/cli.git"
        onOverride={vi.fn()}
        projectId="p1"
        routing={[]}
      />,
    );

    expect(screen.getByTestId(TestId.GithubRemote)).toHaveTextContent("shoptet/cli");
    expect(screen.queryByTestId(IntegrationRoutingEditorTestId.Root)).not.toBeInTheDocument();

    await userEvent.click(screen.getByTestId(TestId.GithubRoute));
    expect(hooks.update.mutate).toHaveBeenCalledWith({
      params: { id: "p1" },
      body: { integrationRouting: [{ integrationId: "gh-shoptet", match: { kind: "github" } }] },
    });
  });
});
