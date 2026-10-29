import { beforeEach, describe, expect, it, vi } from "vitest";
import { DataTableTestId, EntityCardTestId, SubNavTestId } from "@zibby/design-system";
import { renderWithProviders as render, screen, within } from "../../../test/render";
import { AgentsByDepartmentTestId } from "../../agents/components/AgentsByDepartment";
import userEvent from "@testing-library/user-event";
import { RegistriesScreen, RegistriesScreenTestId } from "./RegistriesScreen";

const push = vi.fn();
const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
}));

vi.mock("../queries", () => ({
  useRegistryBindingsQuery: () => ({
    data: {
      skills: { "code-review": ["dev", "qa"] },
      mcp: {},
      hooks: {},
      commands: {},
    },
  }),
}));

vi.mock("../../skills/queries", () => ({
  useSkillsQuery: () => ({
    data: [
      { id: "code-review", name: "Code review", desc: "Reviews PRs", category: "quality" },
      {
        id: "security-audit",
        name: "security-audit",
        desc: "Audits code",
        source: {
          owner: "cloudflare",
          repo: "skills",
          url: "https://github.com/cloudflare/skills",
          path: "security-audit",
          sha: "aaa",
          treeSha: "t",
          installedAt: "2026-10-01T00:00:00Z",
          updatedAt: "2026-10-01T00:00:00Z",
          checkedAt: "2026-10-01T00:00:00Z",
        },
      },
    ],
    isPending: false,
    isError: false,
  }),
  useSkillCategoriesQuery: () => ({ data: [{ name: "quality" }] }),
}));

const { syncAll, toast } = vi.hoisted(() => ({ syncAll: vi.fn(), toast: vi.fn() }));
vi.mock("../../skills/mutations", () => ({
  useCreateSkillMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useSyncAllExternalSkillsMutation: () => ({ mutate: syncAll, isPending: false }),
  useScanExternalSkillsMutation: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
  useInstallExternalSkillsMutation: () => ({
    mutate: vi.fn(),
    reset: vi.fn(),
    isPending: false,
    isError: false,
  }),
}));
vi.mock("../../../components/Toaster/toastBus", () => ({ toastBus: { emit: toast } }));

vi.mock("../../mcp/queries", () => ({
  useMcpServersQuery: () => ({ data: [], isPending: false, isError: false }),
}));
vi.mock("../../mcp/mutations", () => ({
  useCreateMcpServerMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useSetMcpCredentialsMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("../../hooks/queries", () => ({
  useHooksQuery: () => ({ data: [], isPending: false, isError: false }),
}));
vi.mock("../../hooks/mutations", () => ({
  useCreateHookMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("../../commands/queries", () => ({
  useCommandsQuery: () => ({ data: [], isPending: false, isError: false }),
}));
vi.mock("../../commands/mutations", () => ({
  useCreateCommandMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("../../agents/queries", () => ({
  useAgentsQuery: () => ({
    data: [
      { id: "koder", name: "koder", displayName: "Kevin", category: "dev", department: "dev" },
    ],
    isPending: false,
    isError: false,
  }),
  useCategoriesQuery: () => ({ data: [{ name: "dev" }] }),
}));
vi.mock("../../agents/mutations", () => ({
  useCreateAgentMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));

beforeEach(() => {
  push.mockReset();
  replace.mockReset();
});

describe("RegistriesScreen — /system/registries/[kind]", () => {
  it("renders the skills table with a derived Bound in column", () => {
    render(<RegistriesScreen kind="skills" />);
    expect(screen.getByTestId(DataTableTestId.Root)).toBeInTheDocument();
    expect(screen.getByText("Code review")).toBeInTheDocument();
    // Derived from the mocked bindings — department codes render as Tags.
    expect(screen.getByText("DEV")).toBeInTheDocument();
    expect(screen.getByText("QA")).toBeInTheDocument();
  });

  it("renders agents as department sections of cards, not a table", () => {
    render(<RegistriesScreen kind="agents" />);
    expect(screen.queryByTestId(DataTableTestId.Root)).toBeNull();
    const section = screen.getByTestId(`${AgentsByDepartmentTestId.Section}-dev`);
    expect(within(section).getByTestId(EntityCardTestId.Root)).toBeInTheDocument();
    expect(within(section).getByText(/DEV · 1/)).toBeInTheDocument();
  });

  it("the agent create dialog starts placeholder-first with Submit disabled", () => {
    render(<RegistriesScreen openCreateOnMount kind="agents" />);
    expect(screen.getByLabelText("Vlastnící oddělení")).toHaveTextContent("Vyber oddělení…");
    expect(screen.getByRole("button", { name: "Vytvořit agenta" })).toBeDisabled();
  });

  it("leaves kind navigation to the shell sub-nav (no inline SubNav)", () => {
    render(<RegistriesScreen kind="skills" />);
    expect(screen.queryByTestId(SubNavTestId.Root)).toBeNull();
  });

  it("openCreateOnMount pre-opens the create dialog", () => {
    render(<RegistriesScreen openCreateOnMount kind="skills" />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("renders an empty MCP table without crashing", () => {
    render(<RegistriesScreen kind="mcp" />);
    expect(screen.getByTestId(DataTableTestId.Empty)).toBeInTheDocument();
  });

  it("an external skill row shows its owner and last update", () => {
    render(<RegistriesScreen kind="skills" />);
    expect(screen.getByText("security-audit")).toBeInTheDocument();
    expect(screen.getByText("cloudflare")).toBeInTheDocument();
    expect(screen.getByTestId("external-skill-source-updated")).not.toBeEmptyDOMElement();
  });

  it("the skills header installs from a repo and syncs all with a counting toast", async () => {
    syncAll.mockImplementation((_args, opts?: { onSuccess?: (res: unknown) => void }) =>
      opts?.onSuccess?.({ status: 200, body: { checked: 3, updated: ["a"], failed: ["b", "c"] } }),
    );
    render(<RegistriesScreen kind="skills" />);
    const syncButton = screen.getByTestId(RegistriesScreenTestId.SyncAllSkills);
    expect(syncButton).toHaveAccessibleName("Synchronizovat vše");
    await userEvent.click(syncButton);
    expect(syncAll).toHaveBeenCalledWith({ body: {} }, expect.anything());
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringMatching(/1.*2/) }),
    );

    const installButton = screen.getByTestId(RegistriesScreenTestId.InstallSkills);
    expect(installButton).toHaveAccessibleName("Přidat z repozitáře");
    await userEvent.click(installButton);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
