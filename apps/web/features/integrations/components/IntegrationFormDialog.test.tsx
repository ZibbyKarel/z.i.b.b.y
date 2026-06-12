import { renderWithProviders as render, screen } from "../../../test/render";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { IntegrationFormDialog, IntegrationFormTestId } from "./IntegrationFormDialog";

/**
 * The dialog is a pure controlled form: it emits a `{ create | update, secret }`
 * draft and never touches the network. These tests pin the kind-specific create
 * payload and that a freshly entered secret rides alongside (the screen persists
 * it through the separate credentials mutation).
 */
describe("IntegrationFormDialog", () => {
  it("emits a slack create payload with parsed channels and the secret separately", async () => {
    const onSubmit = vi.fn();
    render(<IntegrationFormDialog onClose={vi.fn()} onSubmit={onSubmit} />);

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
    render(<IntegrationFormDialog onClose={vi.fn()} onSubmit={onSubmit} />);

    // Open the kind dropdown and pick the email option (cs catalog → "E-mail").
    await userEvent.click(screen.getByTestId("dropdown-trigger"));
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
})
