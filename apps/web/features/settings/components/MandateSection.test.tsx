import { renderWithProviders as render, screen } from "../../../test/render";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Integration, Mandate } from "@zibby/contracts";
import { MandateSection } from "./MandateSection";

let mandate: Mandate = { defaults: { dispatch: true, reply: false }, channels: {} };
let integrations: Integration[] = [];
const setMandate = vi.fn();

vi.mock("../queries", () => ({ useMandateQuery: () => ({ data: mandate }) }));
vi.mock("../mutations", () => ({ useSetMandateMutation: () => ({ mutate: setMandate }) }));
vi.mock("../../integrations/queries", () => ({ useIntegrationsQuery: () => ({ data: integrations }) }));

const slack: Integration = {
  id: "team",
  kind: "slack",
  name: "Team",
  enabled: true,
  config: { kind: "slack", channels: [] },
  status: "connected",
  hasCredentials: true,
};

beforeEach(() => {
  setMandate.mockReset();
  mandate = { defaults: { dispatch: true, reply: false }, channels: {} };
  integrations = [];
});

describe("MandateSection", () => {
  it("flipping the default reply toggle PUTs the whole mandate with reply on", async () => {
    render(<MandateSection />);
    await userEvent.click(screen.getByTestId("settings-mandate-default-reply"));
    expect(setMandate).toHaveBeenCalledWith({
      body: { defaults: { dispatch: true, reply: true }, channels: {} },
    });
  });

  it("flipping a per-channel toggle writes an explicit channel override", async () => {
    integrations = [slack];
    render(<MandateSection />);
    await userEvent.click(screen.getByTestId("settings-mandate-team-reply"));
    expect(setMandate).toHaveBeenCalledWith({
      body: { defaults: { dispatch: true, reply: false }, channels: { team: { reply: true } } },
    });
  });

  it("reflects the effective per-channel value (override beats default)", () => {
    integrations = [slack];
    mandate = { defaults: { dispatch: true, reply: false }, channels: { team: { reply: true } } };
    render(<MandateSection />);
    expect(screen.getByTestId("settings-mandate-team-reply")).toHaveAttribute("aria-checked", "true");
  });
});
