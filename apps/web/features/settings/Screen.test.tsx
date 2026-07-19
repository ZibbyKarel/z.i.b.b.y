import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { ImmersiveShellTestId } from "@zibby/design-system";
import { renderWithProviders as render, screen } from "../../test/render";
import { Screen } from "./Screen";

const replace = vi.fn();
const refresh = vi.fn();

/** The `?tab=` the mocked URL reports; individual tests set this before render —
 * same pattern as `ProfileScreen.test.tsx`. */
let searchTab = "";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh }),
  useSearchParams: () => {
    const params = new URLSearchParams();
    if (searchTab) params.set("tab", searchTab);
    return params;
  },
}));

vi.mock("../health", () => ({
  useHealthQuery: () => ({
    data: { uptime: 3725, watchers: [] },
    isSuccess: true,
  }),
}));

const CAFFEINATE_KEY = "zibby.caffeinate";

beforeEach(() => {
  replace.mockReset();
  refresh.mockReset();
  searchTab = "";
  localStorage.clear();
  // Expire any cookie a previous test left behind.
  document.cookie = "locale=; path=/; max-age=0";
});

describe("Screen (settings)", () => {
  // F1 (docs/plans/hud2chat-F1-settings.md): the page now renders inside the
  // immersive shell (title/subtitle threaded into `ImmersivePage`) instead of
  // `PageContainer` + `PageHeader`.
  it("renders inside the immersive shell with the settings title", () => {
    render(<Screen />);
    expect(screen.getByTestId(ImmersiveShellTestId.Title)).toHaveTextContent("Nastavení systému");
  });

  it("defaults to the preferences tab", () => {
    render(<Screen />);
    expect(screen.getByTestId("tabs-tab-preferences")).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Jazyk rozhraní")).toBeInTheDocument();
  });

  it("deep-links straight to a tab from the ?tab= URL", () => {
    searchTab = "system";
    render(<Screen />);
    // Lands on the system tab without a click — the URL is the source of truth.
    expect(screen.getByTestId("tabs-tab-system")).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Mac")).toBeInTheDocument();
  });

  it("writes the chosen tab back to the URL for shareability", async () => {
    render(<Screen />);
    await userEvent.click(screen.getByTestId("tabs-tab-system"));
    expect(replace).toHaveBeenCalledWith("/settings?tab=system");
  });

  it("writes back to the bare /settings URL when returning to preferences", async () => {
    searchTab = "system";
    render(<Screen />);
    await userEvent.click(screen.getByTestId("tabs-tab-preferences"));
    expect(replace).toHaveBeenCalledWith("/settings");
  });

  it("reads the caffeinate toggle from localStorage and persists changes", async () => {
    localStorage.setItem(CAFFEINATE_KEY, "false");
    render(<Screen />);
    const toggle = screen.getByRole("switch", { name: "Držet Mac vzhůru (caffeinate)" });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    await userEvent.click(toggle);
    expect(localStorage.getItem(CAFFEINATE_KEY)).toBe("true");
  });

  it("writes the locale cookie and refreshes the page on language change", async () => {
    render(<Screen />);
    await userEvent.click(screen.getByRole("button", { name: "English" }));
    expect(document.cookie).toContain("locale=en");
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("shows the butler footer below the tabs", () => {
    render(<Screen />);
    expect(screen.getByText("ZIBBY — Zestful Intuitive Brainy Butler for You")).toBeInTheDocument();
  });
});
