import { renderWithProviders as render, screen } from "../../../test/render";
import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { IconTileTestId } from "@zibby/design-system";
import { type Integration, type IntegrationKind, IntegrationKindSchema } from "@zibby/contracts";
import { IntegrationCard } from "./IntegrationCard";

const integration = (over: Partial<Integration> = {}): Integration => ({
  id: "team-slack",
  kind: "slack",
  projectId: "media-vault",
  name: "Team Slack",
  enabled: true,
  config: { kind: "slack", channels: ["C1"] },
  status: "connected",
  hasCredentials: true,
  ...over,
});

/** A minimal, schema-valid config for every fixed `IntegrationKind`. */
const CONFIG_BY_KIND: Record<IntegrationKind, Integration["config"]> = {
  slack: { kind: "slack", channels: ["C1"] },
  email: {
    kind: "email",
    imapHost: "imap.example.com",
    imapPort: 993,
    smtpHost: "smtp.example.com",
    smtpPort: 465,
    user: "bot@example.com",
  },
  jira: { kind: "jira", baseUrl: "https://acme.atlassian.net", email: "bot@example.com" },
  github: { kind: "github", repo: "acme/repo", streams: ["issues", "pulls"], username: "octocat" },
  calendar: { kind: "calendar", calendarId: "primary", lookaheadDays: 14 },
  sentry: { kind: "sentry", org: "acme", project: "backend", minLevel: "error" },
};

describe("IntegrationCard enable toggle", () => {
  it("reflects the enabled state on a switch", () => {
    render(
      <IntegrationCard integration={integration({ enabled: true })} onToggleEnabled={vi.fn()} />,
    );
    expect(screen.getByTestId("integration-enabled-toggle")).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("calls onToggleEnabled with the integration when flipped", async () => {
    const onToggleEnabled = vi.fn();
    const entity = integration({ enabled: true });
    render(<IntegrationCard integration={entity} onToggleEnabled={onToggleEnabled} />);
    await userEvent.click(screen.getByTestId("integration-enabled-toggle"));
    expect(onToggleEnabled).toHaveBeenCalledWith(entity);
  });

  it("omits the toggle when no handler is provided", () => {
    render(<IntegrationCard integration={integration()} />);
    expect(screen.queryByTestId("integration-enabled-toggle")).not.toBeInTheDocument();
  });
});

describe("IntegrationCard brand logo", () => {
  it("renders the GitHub brand mark with a non-empty alt", () => {
    render(
      <IntegrationCard
        integration={integration({ kind: "github", config: CONFIG_BY_KIND.github })}
      />,
    );
    const image = screen.getByTestId(IconTileTestId.Image);
    expect(image).toHaveAttribute("src", "/logos/github.svg");
    expect(image.getAttribute("alt")).not.toBe("");
  });

  it("renders no image for an email integration, only its glyph tile", () => {
    render(
      <IntegrationCard
        integration={integration({ kind: "email", config: CONFIG_BY_KIND.email })}
      />,
    );
    expect(screen.queryByTestId(IconTileTestId.Image)).not.toBeInTheDocument();
    expect(screen.getByTestId(IconTileTestId.Root)).toBeInTheDocument();
  });

  it.each(IntegrationKindSchema.options)("renders a card for kind %s without throwing", (kind) => {
    render(<IntegrationCard integration={integration({ kind, config: CONFIG_BY_KIND[kind] })} />);
    expect(screen.getByTestId(IconTileTestId.Root)).toBeInTheDocument();
  });
});
