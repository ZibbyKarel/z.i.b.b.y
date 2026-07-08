import { type GateRule, type GlobalGateRule, type Project, SUBSYSTEMS } from "@zibby/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen } from "../../../../test/render";
import { GatesTab, GatesTabTestId } from "./GatesTab";

const { hooks } = vi.hoisted(() => ({
  hooks: {
    rules: { data: [] as GlobalGateRule[], isPending: false, isError: false, refetch: vi.fn() },
    floor: { data: [] as GateRule[] },
    activeProjectId: null as string | null,
    projects: [] as Project[],
  },
}));

// GatesTab renders the REAL `GateRulesSection` (unmocked, phase-87 plan §2:
// "reuse GateRulesSection ... its third call site") — mocking its data layer
// here is what makes the floor/catalog observable without a live API.
vi.mock("../../../gates/queries", () => ({
  useGateRulesQuery: () => hooks.rules,
  useSystemPolicyQuery: () => hooks.floor,
}));
vi.mock("../../../gates/mutations", () => ({
  useCreateGateRuleMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateGateRuleMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteGateRuleMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useReorderGateRulesMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("../../../agents", () => ({ useAgentsQuery: () => ({ data: [] }) }));
vi.mock("../../../skills", () => ({ useSkillsQuery: () => ({ data: [] }) }));
vi.mock("../../../projects", () => ({
  useActiveProject: () => ({ activeProjectId: hooks.activeProjectId, setActiveProject: vi.fn() }),
  useProjectsQuery: () => ({ data: hooks.projects }),
}));

const forge = SUBSYSTEMS.find((s) => s.id === "forge")!;
const subsystem = {
  id: forge.id,
  name: forge.name,
  tagline: forge.tagline,
  mandate: forge.mandate,
  color: forge.color,
  heroImage: null,
  state: "klid" as const,
  tier2Count: 0,
  tier3Count: 0,
};

const allowRule: GlobalGateRule = {
  id: "gr-allow",
  match: [{ type: "scope", scope: "feature/*" }],
  decision: "allow",
  ownerSubsystem: "forge",
};
const notifyRule: GlobalGateRule = {
  id: "gr-notify",
  match: [{ type: "action", action: "git.push", branch: "feature/x" }],
  decision: "notify",
  ownerSubsystem: "forge",
};
const askRule: GlobalGateRule = {
  id: "gr-ask",
  match: [{ type: "action", action: "merge" }],
  decision: "ask",
  resolve: { type: "human" },
  ownerSubsystem: "forge",
};
const denyRule: GlobalGateRule = {
  id: "gr-deny",
  match: [{ type: "tool", tool: "Bash" }],
  decision: "deny",
  ownerSubsystem: "forge",
};
const otherSubsystemRule: GlobalGateRule = {
  id: "gr-puls",
  match: [{ type: "context", context: "channel" }],
  decision: "notify",
  ownerSubsystem: "puls",
};
const untaggedRule: GlobalGateRule = {
  id: "gr-global",
  match: [{ type: "scope", scope: "*" }],
  decision: "allow",
};

const lockedFloorRule: GateRule = {
  id: "deny-bash",
  source: "system",
  locked: true,
  match: [{ type: "tool", tool: "Bash" }],
  decision: "deny",
};

describe("GatesTab (Phase 87)", () => {
  beforeEach(() => {
    hooks.rules = { data: [], isPending: false, isError: false, refetch: vi.fn() };
    hooks.floor = { data: [] };
    hooks.activeProjectId = null;
    hooks.projects = [];
  });

  it("renders the locked system floor unfiltered, with no edit/delete affordance", () => {
    hooks.floor = { data: [lockedFloorRule] };
    hooks.rules = { data: [], isPending: false, isError: false, refetch: vi.fn() };

    renderWithProviders(<GatesTab subsystem={subsystem} />);

    // "the floor is visible, not hidden" (design doc) — the shared SystemFloorPanel
    // title from the gates catalog namespace.
    expect(screen.getByText("Zděděná systémová pravidla")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /smazat|upravit/i })).not.toBeInTheDocument();
  });

  it("renders one mad-libs sentence per decision type, ask includes the resolve leaf", () => {
    hooks.rules = {
      data: [allowRule, notifyRule, askRule, denyRule],
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    };

    renderWithProviders(<GatesTab subsystem={subsystem} />);

    const rows = screen.getAllByTestId(GatesTabTestId.SentenceRow);
    expect(rows).toHaveLength(4);

    expect(rows[0]).toHaveTextContent("Než Forge udělá");
    expect(rows[0]).toHaveTextContent("scope");
    expect(rows[0]).toHaveTextContent("allow");

    expect(rows[1]).toHaveTextContent("git.push");
    expect(rows[1]).toHaveTextContent("notify");

    expect(rows[2]).toHaveTextContent("merge");
    expect(rows[2]).toHaveTextContent("ask");
    expect(rows[2]).toHaveTextContent("Ty"); // resolve leaf (human) via ResolveChips

    expect(rows[3]).toHaveTextContent("Bash");
    expect(rows[3]).toHaveTextContent("deny");
  });

  it("scopes both the sentence panel and the catalog to this subsystem's tagged rules", () => {
    hooks.rules = {
      data: [allowRule, otherSubsystemRule, untaggedRule],
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    };

    renderWithProviders(<GatesTab subsystem={subsystem} />);

    expect(screen.getAllByTestId(GatesTabTestId.SentenceRow)).toHaveLength(1);
    expect(screen.getByTestId(GatesTabTestId.Catalog)).toHaveTextContent("scope");
    expect(screen.getByTestId(GatesTabTestId.Catalog)).not.toHaveTextContent("channel");
  });

  it("shows an honest empty note when there is no active project", () => {
    hooks.activeProjectId = null;
    hooks.rules = { data: [], isPending: false, isError: false, refetch: vi.fn() };

    renderWithProviders(<GatesTab subsystem={subsystem} />);

    expect(screen.getByTestId(GatesTabTestId.AutopilotEmpty)).toBeInTheDocument();
    expect(screen.queryByTestId(GatesTabTestId.AutopilotLink)).not.toBeInTheDocument();
  });

  it("shows the active project's autonomy policy summary read-only, with a link to its profile tab", () => {
    hooks.activeProjectId = "acme";
    hooks.projects = [
      {
        id: "acme",
        name: "Acme Corp",
        path: "/repo/acme",
        autonomy_policy: { can_do_alone: ["reply"], always_ask: ["merge"] },
      },
    ];
    hooks.rules = { data: [], isPending: false, isError: false, refetch: vi.fn() };

    renderWithProviders(<GatesTab subsystem={subsystem} />);

    expect(screen.getByText("Acme Corp")).toBeInTheDocument();
    expect(screen.getByText("reply")).toBeInTheDocument();
    expect(screen.getByText("merge")).toBeInTheDocument();
    const link = screen.getByTestId(GatesTabTestId.AutopilotLink);
    expect(link).toHaveAttribute("href", "/projects/acme?tab=profile");
  });

  it("reports no project-specific policy honestly when the active project has none set", () => {
    hooks.activeProjectId = "acme";
    hooks.projects = [{ id: "acme", name: "Acme Corp", path: "/repo/acme" }];
    hooks.rules = { data: [], isPending: false, isError: false, refetch: vi.fn() };

    renderWithProviders(<GatesTab subsystem={subsystem} />);

    expect(
      screen.getByText("Bez vlastního nastavení — platí jen globální podlaha."),
    ).toBeInTheDocument();
  });
});
