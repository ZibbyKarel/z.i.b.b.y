import { renderWithProviders as render, screen } from "../../../test/render";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { IntegrationFormDialog, IntegrationFormTestId } from "./IntegrationFormDialog";

/**
 * The dialog is a pure controlled CREATE-ONLY form (N4h — editing lives on the
 * project-nested detail page): it emits a `{ create, secret }` draft and never
 * touches the network. These tests pin the kind-specific create
 * payload and that a freshly entered secret rides alongside (the screen persists
 * it through the separate credentials mutation).
 */
describe("IntegrationFormDialog", () => {
  it("emits a slack create payload with parsed channels and the secret separately", async () => {
    const onSubmit = vi.fn();
    render(<IntegrationFormDialog onClose={vi.fn()} onCreate={onSubmit} projectId="acme-app" />);

    await userEvent.type(screen.getByTestId("integration-id"), "team-slack");
    await userEvent.type(screen.getByTestId(IntegrationFormTestId.Name), "Team Slack");
    await userEvent.type(screen.getByTestId(IntegrationFormTestId.SlackChannels), "C1, C2 , C3");
    await userEvent.type(screen.getByTestId(IntegrationFormTestId.Secret), "xoxb-secret");
    await userEvent.click(screen.getByTestId(IntegrationFormTestId.Submit));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const draft = onSubmit.mock.calls[0]![0];
    expect(draft.create).toEqual({
      id: "team-slack",
      kind: "slack",
      projectId: "acme-app",
      name: "Team Slack",
      enabled: true,
      config: { kind: "slack", channels: ["C1", "C2", "C3"] },
    });
    // The secret is carried out-of-band, never inside the persisted config.
    expect(draft.secret).toBe("xoxb-secret");
    expect(JSON.stringify(draft.create)).not.toContain("xoxb-secret");
  });

  it("switches to email config when the kind dropdown changes", async () => {
    const onSubmit = vi.fn();
    render(<IntegrationFormDialog onClose={vi.fn()} onCreate={onSubmit} projectId="acme-app" />);

    // Open the kind dropdown and pick the email option (cs catalog → "E-mail").
    // The kind selector is the only `dropdown-trigger` before a kind is picked.
    await userEvent.click(screen.getAllByTestId("dropdown-trigger")[0]!);
    await userEvent.click(screen.getByText("E-mail"));

    await userEvent.type(screen.getByTestId("integration-id"), "support-mail");
    await userEvent.type(screen.getByTestId(IntegrationFormTestId.ImapHost), "imap.example.com");
    await userEvent.type(screen.getByTestId(IntegrationFormTestId.SmtpHost), "smtp.example.com");
    await userEvent.type(screen.getByTestId(IntegrationFormTestId.User), "bot@example.com");
    await userEvent.click(screen.getByTestId(IntegrationFormTestId.Submit));

    const draft = onSubmit.mock.calls[0]![0];
    expect(draft.create.kind).toBe("email");
    expect(draft.create.config).toEqual({
      kind: "email",
      imapHost: "imap.example.com",
      imapPort: 993,
      smtpHost: "smtp.example.com",
      smtpPort: 465,
      user: "bot@example.com",
    });
  });

  it("emits a jira create payload with the non-secret config and the token separately", async () => {
    const onSubmit = vi.fn();
    render(<IntegrationFormDialog onClose={vi.fn()} onCreate={onSubmit} projectId="acme-app" />);

    // The kind selector is the only `dropdown-trigger` before a kind is picked.
    await userEvent.click(screen.getAllByTestId("dropdown-trigger")[0]!);
    await userEvent.click(screen.getByText("Jira"));

    await userEvent.type(screen.getByTestId("integration-id"), "acme-jira");
    await userEvent.type(
      screen.getByTestId(IntegrationFormTestId.JiraBaseUrl),
      "https://acme.atlassian.net",
    );
    await userEvent.type(screen.getByTestId(IntegrationFormTestId.JiraEmail), "ops@acme.com");
    await userEvent.type(screen.getByTestId(IntegrationFormTestId.JiraProjectKey), "ACME");
    await userEvent.type(screen.getByTestId(IntegrationFormTestId.Secret), "jira-api-token");
    await userEvent.click(screen.getByTestId(IntegrationFormTestId.Submit));

    const draft = onSubmit.mock.calls[0]![0];
    expect(draft.create.kind).toBe("jira");
    expect(draft.create.config).toEqual({
      kind: "jira",
      baseUrl: "https://acme.atlassian.net",
      email: "ops@acme.com",
      projectKey: "ACME",
    });
    // The token rides out-of-band — never inside the committed config.
    expect(draft.secret).toBe("jira-api-token");
    expect(JSON.stringify(draft.create)).not.toContain("jira-api-token");
  });

  it("emits a github create payload, dropping a disabled stream", async () => {
    const onSubmit = vi.fn();
    render(<IntegrationFormDialog onClose={vi.fn()} onCreate={onSubmit} projectId="acme-app" />);

    // The kind selector is the only `dropdown-trigger` before a kind is picked.
    await userEvent.click(screen.getAllByTestId("dropdown-trigger")[0]!);
    await userEvent.click(screen.getByText("GitHub"));

    await userEvent.type(screen.getByTestId("integration-id"), "zibby-repo");
    await userEvent.type(screen.getByTestId(IntegrationFormTestId.GithubRepo), "acme/zibby");
    // Default is both streams; turn pull requests off so only issues remain.
    await userEvent.click(screen.getByTestId(IntegrationFormTestId.GithubStreamPulls));
    await userEvent.type(screen.getByTestId(IntegrationFormTestId.Secret), "ghp-token");
    await userEvent.click(screen.getByTestId(IntegrationFormTestId.Submit));

    const draft = onSubmit.mock.calls[0]![0];
    expect(draft.create.kind).toBe("github");
    expect(draft.create.config).toEqual({
      kind: "github",
      repo: "acme/zibby",
      streams: ["issues"],
    });
    expect(draft.secret).toBe("ghp-token");
  });

  it("emits a calendar create payload, defaulting the calendar id, with the SA key separate", async () => {
    const onSubmit = vi.fn();
    render(<IntegrationFormDialog onClose={vi.fn()} onCreate={onSubmit} projectId="acme-app" />);

    // The kind selector is the only `dropdown-trigger` before a kind is picked.
    await userEvent.click(screen.getAllByTestId("dropdown-trigger")[0]!);
    await userEvent.click(screen.getByText("Kalendář"));

    await userEvent.type(screen.getByTestId("integration-id"), "acme-cal");
    // Leave the calendar id blank → defaults to "primary"; secret holds the SA JSON.
    await userEvent.type(screen.getByTestId(IntegrationFormTestId.Secret), '{{"client_email":"x"}');
    await userEvent.click(screen.getByTestId(IntegrationFormTestId.Submit));

    const draft = onSubmit.mock.calls[0]![0];
    expect(draft.create.kind).toBe("calendar");
    expect(draft.create.config).toEqual({
      kind: "calendar",
      calendarId: "primary",
      lookaheadDays: 14,
    });
    expect(JSON.stringify(draft.create)).not.toContain("client_email");
  });

  it("blocks save until a github repo is owner/name shaped", async () => {
    const onSubmit = vi.fn();
    render(<IntegrationFormDialog onClose={vi.fn()} onCreate={onSubmit} projectId="acme-app" />);

    // The kind selector is the only `dropdown-trigger` before a kind is picked.
    await userEvent.click(screen.getAllByTestId("dropdown-trigger")[0]!);
    await userEvent.click(screen.getByText("GitHub"));

    await userEvent.type(screen.getByTestId("integration-id"), "bad-repo");
    await userEvent.type(screen.getByTestId(IntegrationFormTestId.GithubRepo), "not-a-repo");
    expect(screen.getByTestId(IntegrationFormTestId.Submit)).toBeDisabled();
  });
});
