import { renderWithProviders as render, screen } from "../../../test/render";
import { fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mandate } from "@zibby/contracts";
import { IntegrationAutonomyPanel, IntegrationAutonomyTestId } from "./IntegrationAutonomyPanel";

let mandate: Mandate | undefined;
const mutate = vi.fn();
vi.mock("../../settings/queries", () => ({
  useMandateQuery: () => ({ data: mandate }),
}));
vi.mock("../../settings/mutations", () => ({
  useSetMandateMutation: () => ({ mutate, isPending: false }),
}));

describe("IntegrationAutonomyPanel", () => {
  beforeEach(() => {
    mutate.mockClear();
    mandate = { defaults: { dispatch: true, reply: false }, channels: {} };
  });

  it("renders nothing until the mandate has loaded", () => {
    mandate = undefined;
    render(<IntegrationAutonomyPanel integrationId="team-slack" />);
    expect(screen.queryByTestId(IntegrationAutonomyTestId.Dispatch)).toBeNull();
  });

  it("reflects the effective flags: channel override wins over the default", () => {
    mandate = {
      defaults: { dispatch: true, reply: false },
      channels: { "team-slack": { reply: true } },
    };
    render(<IntegrationAutonomyPanel integrationId="team-slack" />);
    // A checked Toggle exposes aria-checked=true on its switch role.
    expect(screen.getByTestId(IntegrationAutonomyTestId.Dispatch)).toBeChecked();
    expect(screen.getByTestId(IntegrationAutonomyTestId.Reply)).toBeChecked();
  });

  it("falls back to the defaults when the channel has no override", () => {
    render(<IntegrationAutonomyPanel integrationId="team-slack" />);
    expect(screen.getByTestId(IntegrationAutonomyTestId.Dispatch)).toBeChecked();
    expect(screen.getByTestId(IntegrationAutonomyTestId.Reply)).not.toBeChecked();
  });

  it("flipping reply writes a per-channel override, preserving the rest of the mandate", () => {
    render(<IntegrationAutonomyPanel integrationId="team-slack" />);
    fireEvent.click(screen.getByTestId(IntegrationAutonomyTestId.Reply));
    expect(mutate).toHaveBeenCalledWith({
      body: {
        defaults: { dispatch: true, reply: false },
        channels: { "team-slack": { reply: true } },
      },
    });
  });
});
