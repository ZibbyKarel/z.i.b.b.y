import userEvent from "@testing-library/user-event";
import type { Integration } from "@zibby/contracts";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders as render, screen } from "../../../test/render";
import {
  CompanyIntegrationsPanel,
  CompanyIntegrationsPanelTestId as TestId,
} from "./CompanyIntegrationsPanel";
import { IntegrationFormTestId } from "../../integrations/components/IntegrationFormDialog";

const { hooks } = vi.hoisted(() => ({
  hooks: {
    list: { data: [] as Integration[] },
    create: { mutate: vi.fn(), isPending: false },
  },
}));
const idle = { mutate: vi.fn(), isPending: false };

vi.mock("../../integrations", () => ({
  useCompanyIntegrationsQuery: () => hooks.list,
  useCreateIntegrationMutation: () => hooks.create,
  useSetCredentialsMutation: () => idle,
  useTestIntegrationMutation: () => idle,
  useUpdateIntegrationMutation: () => idle,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

describe("CompanyIntegrationsPanel", () => {
  it("shows the empty state, then creates a company-owned integration (companyId, no projectId)", async () => {
    render(<CompanyIntegrationsPanel companyId="shoptet" />);
    expect(screen.getByTestId(TestId.Empty)).toBeInTheDocument();

    await userEvent.click(screen.getByTestId(TestId.Add));
    await userEvent.type(screen.getByTestId("integration-id"), "slack-shoptet");
    await userEvent.click(screen.getByTestId(IntegrationFormTestId.Submit));

    const body = hooks.create.mutate.mock.calls[0]?.[0].body;
    expect(body).toMatchObject({ id: "slack-shoptet", kind: "slack", companyId: "shoptet" });
    expect(body).not.toHaveProperty("projectId");
  });
});
