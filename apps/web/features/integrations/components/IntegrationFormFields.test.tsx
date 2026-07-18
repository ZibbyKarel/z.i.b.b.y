import { renderWithProviders as render, screen } from "../../../test/render";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { IntegrationFormDialog, IntegrationFormTestId } from "./IntegrationFormDialog";

/**
 * NS2 F7a — Sentry is the first monitor-only integration kind, settable in the
 * web form like any other. Driven through {@link IntegrationFormDialog} (the
 * dialog is a thin controlled wrapper over `IntegrationFormFields` + its hook)
 * so these tests exercise the real kind-switch, field visibility, secret label,
 * and `buildCreate()` payload — no new harness needed.
 */
describe("IntegrationFormFields — sentry kind", () => {
  it("selecting sentry renders org/project fields and hides github/slack fields", async () => {
    const onSubmit = vi.fn();
    render(<IntegrationFormDialog onClose={vi.fn()} onCreate={onSubmit} projectId="acme-app" />);

    // The kind selector is always the first `dropdown-trigger` in DOM order.
    await userEvent.click(screen.getAllByTestId("dropdown-trigger")[0]!);
    await userEvent.click(screen.getByText("Sentry"));

    expect(screen.getByTestId(IntegrationFormTestId.SentryOrg)).toBeInTheDocument();
    expect(screen.getByTestId(IntegrationFormTestId.SentryProject)).toBeInTheDocument();
    expect(screen.getByTestId(IntegrationFormTestId.SentryBaseUrl)).toBeInTheDocument();
    expect(screen.queryByTestId(IntegrationFormTestId.GithubRepo)).not.toBeInTheDocument();
    expect(screen.queryByTestId(IntegrationFormTestId.SlackChannels)).not.toBeInTheDocument();
  });

  it("secret label reads API token for sentry", async () => {
    render(<IntegrationFormDialog onClose={vi.fn()} onCreate={vi.fn()} projectId="acme-app" />);
    await userEvent.click(screen.getAllByTestId("dropdown-trigger")[0]!);
    await userEvent.click(screen.getByText("Sentry"));

    expect(screen.getByTestId(IntegrationFormTestId.Secret)).toHaveAccessibleName("API token");
  });

  it("buildCreate() yields a valid SentryConfig, with the token carried out-of-band", async () => {
    const onSubmit = vi.fn();
    render(<IntegrationFormDialog onClose={vi.fn()} onCreate={onSubmit} projectId="acme-app" />);

    await userEvent.click(screen.getAllByTestId("dropdown-trigger")[0]!);
    await userEvent.click(screen.getByText("Sentry"));

    await userEvent.type(screen.getByTestId("integration-id"), "acme-sentry");
    await userEvent.type(screen.getByTestId(IntegrationFormTestId.SentryOrg), "acme");
    await userEvent.type(screen.getByTestId(IntegrationFormTestId.SentryProject), "backend");
    await userEvent.type(screen.getByTestId(IntegrationFormTestId.Secret), "sntrys_secret");
    await userEvent.click(screen.getByTestId(IntegrationFormTestId.Submit));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const draft = onSubmit.mock.calls[0]![0];
    expect(draft.create.kind).toBe("sentry");
    expect(draft.create.config).toEqual({
      kind: "sentry",
      org: "acme",
      project: "backend",
      minLevel: "error",
    });
    expect(draft.secret).toBe("sntrys_secret");
    expect(JSON.stringify(draft.create)).not.toContain("sntrys_secret");
  });

  it("blocks save until org and project are both filled in", async () => {
    render(<IntegrationFormDialog onClose={vi.fn()} onCreate={vi.fn()} projectId="acme-app" />);
    await userEvent.click(screen.getAllByTestId("dropdown-trigger")[0]!);
    await userEvent.click(screen.getByText("Sentry"));

    await userEvent.type(screen.getByTestId("integration-id"), "acme-sentry");
    await userEvent.type(screen.getByTestId(IntegrationFormTestId.SentryOrg), "acme");
    expect(screen.getByTestId(IntegrationFormTestId.Submit)).toBeDisabled();
  });
});
