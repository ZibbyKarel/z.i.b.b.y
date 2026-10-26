import { renderWithProviders as render, screen } from "../../../test/render";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MarketplaceDetail } from "@zibby/contracts";
import { MarketplacePluginPanelTestId } from "../components/MarketplacePluginPanel";
import { MarketplaceDetailScreen, MarketplaceDetailScreenTestId } from "./MarketplaceDetailScreen";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const DETAIL: MarketplaceDetail = {
  id: "zibby-skills",
  source: "/repo/skills",
  devMode: true,
  localPath: "/repo/skills",
  managedClone: false,
  addedAt: "2026-10-26T10:00:00.000Z",
  plugins: [
    {
      name: "zibby",
      version: "1.2.0",
      installed: true,
      linked: true,
      skills: [{ name: "standup-post", description: "Post the standup" }],
      agents: [],
      commands: [],
      hooks: true,
      mcpServers: ["jira"],
    },
    {
      name: "extras",
      installed: false,
      linked: false,
      skills: [],
      agents: [],
      commands: [],
      hooks: false,
      mcpServers: [],
    },
  ],
};

const { hooks } = vi.hoisted(() => ({
  hooks: {
    query: { data: undefined as unknown, isPending: false, isError: false, refetch: vi.fn() },
    update: vi.fn(),
    installAll: vi.fn(),
    install: vi.fn(),
    uninstall: vi.fn(),
    remove: vi.fn(),
    failing: false,
  },
}));

const idle = (mutate: ReturnType<typeof vi.fn>) => ({
  mutate,
  isPending: false,
  isError: false,
  error: null,
});

vi.mock("../queries", () => ({ useMarketplaceQuery: () => hooks.query }));
vi.mock("../mutations", () => ({
  useUpdateMarketplaceMutation: () => idle(hooks.update),
  useInstallAllPluginsMutation: () => idle(hooks.installAll),
  useInstallPluginMutation: () => idle(hooks.install),
  useUninstallPluginMutation: () =>
    hooks.failing
      ? {
          mutate: hooks.uninstall,
          isPending: false,
          isError: true,
          error: { status: 502, body: { message: "claude: uninstall failed" } },
        }
      : idle(hooks.uninstall),
  useRemoveMarketplaceMutation: () => idle(hooks.remove),
}));

describe("MarketplaceDetailScreen", () => {
  beforeEach(() => {
    push.mockClear();
    for (const m of [hooks.update, hooks.installAll, hooks.install, hooks.uninstall, hooks.remove])
      m.mockReset();
    hooks.failing = false;
    hooks.query = { data: DETAIL, isPending: false, isError: false, refetch: vi.fn() };
  });

  it("shows header, mode and one panel per plugin with its components", () => {
    render(<MarketplaceDetailScreen marketplaceId="zibby-skills" />);
    expect(screen.getByTestId(MarketplaceDetailScreenTestId.Mode)).toHaveTextContent(
      "Vývojářský režim",
    );
    expect(screen.getByTestId(MarketplaceDetailScreenTestId.Source)).toHaveTextContent(
      "/repo/skills",
    );
    expect(screen.getByText("standup-post")).toBeInTheDocument();
    expect(screen.getByText(/Post the standup/)).toBeInTheDocument();
    expect(screen.getAllByTestId(MarketplacePluginPanelTestId.Installed)).toHaveLength(2);
    expect(screen.getByTestId(MarketplacePluginPanelTestId.Linked)).toBeInTheDocument();
  });

  it("Install and Uninstall target the right plugin", async () => {
    render(<MarketplaceDetailScreen marketplaceId="zibby-skills" />);
    await userEvent.click(screen.getByTestId(MarketplacePluginPanelTestId.Install));
    expect(hooks.install).toHaveBeenCalledWith({
      params: { id: "zibby-skills", plugin: "extras" },
    });
    await userEvent.click(screen.getByTestId(MarketplacePluginPanelTestId.Uninstall));
    expect(hooks.uninstall).toHaveBeenCalledWith({
      params: { id: "zibby-skills", plugin: "zibby" },
    });
  });

  it("Update and Install all fire their mutations", async () => {
    render(<MarketplaceDetailScreen marketplaceId="zibby-skills" />);
    await userEvent.click(screen.getByTestId(MarketplaceDetailScreenTestId.Update));
    await userEvent.click(screen.getByTestId(MarketplaceDetailScreenTestId.InstallAll));
    expect(hooks.update).toHaveBeenCalledWith({ params: { id: "zibby-skills" } });
    expect(hooks.installAll).toHaveBeenCalledWith({ params: { id: "zibby-skills" } });
  });

  it("Remove asks in a confirm dialog, then removes and navigates to the list", async () => {
    hooks.remove.mockImplementation((_v, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.());
    render(<MarketplaceDetailScreen marketplaceId="zibby-skills" />);
    await userEvent.click(screen.getByTestId(MarketplaceDetailScreenTestId.Remove));
    expect(screen.getByText("Odebrat marketplace?")).toBeInTheDocument();
    expect(hooks.remove).not.toHaveBeenCalled();
    const confirm = screen
      .getAllByRole("button", { name: "Odebrat" })
      .find((b) => b !== screen.getByTestId(MarketplaceDetailScreenTestId.Remove));
    await userEvent.click(confirm!);
    expect(hooks.remove).toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith("/workforce/marketplaces");
  });

  it("surfaces a CLI failure message", () => {
    hooks.failing = true;
    render(<MarketplaceDetailScreen marketplaceId="zibby-skills" />);
    expect(screen.getByTestId(MarketplaceDetailScreenTestId.Error)).toHaveTextContent(
      "claude: uninstall failed",
    );
  });
});
