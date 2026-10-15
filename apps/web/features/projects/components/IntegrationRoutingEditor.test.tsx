import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders as render, screen } from "../../../test/render";
import {
  IntegrationRoutingEditor,
  IntegrationRoutingEditorTestId as TestId,
} from "./IntegrationRoutingEditor";

describe("IntegrationRoutingEditor", () => {
  it("keeps Save disabled until a jira rule has a project key or JQL", async () => {
    render(<IntegrationRoutingEditor kind="jira" onSave={vi.fn()} />);
    expect(screen.getByTestId(TestId.Save)).toBeDisabled();

    await userEvent.type(screen.getByTestId(TestId.ProjectKey), "SHOP");
    expect(screen.getByTestId(TestId.Save)).toBeEnabled();
  });

  it("saves the jira match with list fields split and trimmed", async () => {
    const onSave = vi.fn();
    render(<IntegrationRoutingEditor kind="jira" onSave={onSave} />);

    await userEvent.type(screen.getByTestId(TestId.ProjectKey), "SHOP");
    await userEvent.type(screen.getByTestId(TestId.Components), "cli, api ,");
    await userEvent.type(screen.getByTestId(TestId.Labels), "partner");
    await userEvent.click(screen.getByTestId(TestId.Save));

    expect(onSave).toHaveBeenCalledWith({
      kind: "jira",
      projectKey: "SHOP",
      components: ["cli", "api"],
      labels: ["partner"],
    });
  });

  it("saves a jql-only jira rule", async () => {
    const onSave = vi.fn();
    render(<IntegrationRoutingEditor kind="jira" onSave={onSave} />);

    await userEvent.type(screen.getByTestId(TestId.Jql), "labels = cms4");
    await userEvent.click(screen.getByTestId(TestId.Save));

    expect(onSave).toHaveBeenCalledWith({ kind: "jira", jql: "labels = cms4" });
  });

  it("saves slack channels and needs at least one", async () => {
    const onSave = vi.fn();
    render(<IntegrationRoutingEditor kind="slack" onSave={onSave} />);
    expect(screen.getByTestId(TestId.Save)).toBeDisabled();

    await userEvent.type(screen.getByTestId(TestId.Channels), "C1, C2");
    await userEvent.click(screen.getByTestId(TestId.Save));

    expect(onSave).toHaveBeenCalledWith({ kind: "slack", channels: ["C1", "C2"] });
  });

  it("prefills from the existing rule and Clear sends null", async () => {
    const onSave = vi.fn();
    render(
      <IntegrationRoutingEditor
        kind="jira"
        onSave={onSave}
        rule={{ integrationId: "jira-co", match: { kind: "jira", projectKey: "CMS" } }}
      />,
    );
    expect(screen.getByTestId(TestId.ProjectKey)).toHaveValue("CMS");

    await userEvent.click(screen.getByTestId(TestId.Clear));
    expect(onSave).toHaveBeenCalledWith(null);
  });
});
