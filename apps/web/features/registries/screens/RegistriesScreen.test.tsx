import { beforeEach, describe, expect, it, vi } from "vitest";
import { DataTableTestId, EntityCardTestId, SubNavTestId } from "@zibby/design-system";
import { renderWithProviders as render, screen, within } from "../../../test/render";
import { AgentsByDepartmentTestId } from "../../agents/components/AgentsByDepartment";
import { RegistriesScreen } from "./RegistriesScreen";

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
    data: [{ id: "code-review", name: "Code review", desc: "Reviews PRs", category: "quality" }],
    isPending: false,
    isError: false,
  }),
  useSkillCategoriesQuery: () => ({ data: [{ name: "quality" }] }),
}));

vi.mock("../../skills/mutations", () => ({
  useCreateSkillMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));

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

  it("the agent create dialog carries a department", () => {
    render(<RegistriesScreen openCreateOnMount kind="agents" />);
    expect(screen.getByLabelText("Vlastnící oddělení")).toBeInTheDocument();
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
});
