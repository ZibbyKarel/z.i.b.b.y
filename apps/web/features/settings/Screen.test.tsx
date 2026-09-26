import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { renderWithProviders as render, screen } from "../../test/render";
import { AppearanceProvider } from "../../state/appearance";
import { SettingsScreen } from "./Screen";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

vi.mock("../health", () => ({
  useHealthQuery: () => ({
    data: { uptime: 3725, watchers: [] },
    isSuccess: true,
  }),
}));

const CAFFEINATE_KEY = "zibby.caffeinate";

beforeEach(() => {
  refresh.mockReset();
  localStorage.clear();
  // Expire any cookie a previous test left behind.
  document.cookie = "locale=; path=/; max-age=0";
});

describe("SettingsScreen — /system/settings/[section]", () => {
  it("renders the settings title", () => {
    render(<SettingsScreen section="general" />);
    expect(screen.getByText("Nastavení systému")).toBeInTheDocument();
  });

  it("marks the current section active in the sub-nav and shows its content", () => {
    render(<SettingsScreen section="general" />);
    expect(screen.getByTestId("subnav-item-/system/settings/general")).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByText("Jazyk rozhraní")).toBeInTheDocument();
  });

  it("renders the status section's system info", () => {
    render(<SettingsScreen section="status" />);
    expect(screen.getByText("Mac")).toBeInTheDocument();
  });

  it("renders the appearance section's theme control", () => {
    // `AppearanceSection` reads `useAppearance()` — `AppearanceProvider` isn't
    // part of the shared `renderWithProviders` shell, so this one test brings
    // its own (it also happens to supply the real `DesignSystemProvider`).
    render(
      <AppearanceProvider>
        <SettingsScreen section="appearance" />
      </AppearanceProvider>,
    );
    expect(screen.getByTestId("segmented-control-item-system")).toBeInTheDocument();
  });

  it("reads the caffeinate toggle from localStorage and persists changes", async () => {
    localStorage.setItem(CAFFEINATE_KEY, "false");
    render(<SettingsScreen section="general" />);
    const toggle = screen.getByRole("switch", { name: "Držet Mac vzhůru (caffeinate)" });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    await userEvent.click(toggle);
    expect(localStorage.getItem(CAFFEINATE_KEY)).toBe("true");
  });

  it("writes the locale cookie and refreshes the page on language change", async () => {
    render(<SettingsScreen section="general" />);
    await userEvent.click(screen.getByRole("button", { name: "English" }));
    expect(document.cookie).toContain("locale=en");
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("shows the butler footer on every section", () => {
    render(<SettingsScreen section="machine" />);
    expect(screen.getByText("ZIBBY — Zestful Intuitive Brainy Butler for You")).toBeInTheDocument();
  });
});
