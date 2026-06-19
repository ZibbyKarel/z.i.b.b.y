import { renderWithProviders as render, screen } from "../../../test/render";
import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import type { Integration } from "@zibby/contracts";
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
