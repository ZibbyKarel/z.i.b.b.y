import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  APP_FRAME_MAIN_CONTENT_ID,
  AppFrameTestId,
  AppHeaderTestId,
  MenuButtonTestId,
  MobileMenuTestId,
  MobileToolbarTestId,
  SubNavTestId,
  TabsTestId,
} from "@zibby/design-system";
import { renderWithProviders, screen } from "../../../test/render";
import { PinPageDialogTestId } from "../../../features/pins";
import { AppShell, AppShellTestId } from "./AppShell";

let mockPath = "/chat";
let mockPhone = false;
vi.mock("../../../hooks/useIsPhone", () => ({ useIsPhone: () => mockPhone }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => mockPath,
  useSearchParams: () => new URLSearchParams(),
}));

// ZB-01: `AppShell` is rebuilt over the ZibbyCorp DS `AppFrame` — a header
// (section nav, limits), the PINNED/"NEEDS YOU"/RUNNING rails and the
// page content, plus the same provider stack (catalog/new-task/chat) as
// before. `usePathname`/`useRouter`/`useSearchParams` come from the global
// `next/navigation` mock in `vitest.setup.tsx` (`usePathname` → `/chat`,
// `useSearchParams` → empty), which `sectionForPath` maps to the `org`
// section. Every data-backed slot (approvals/runs/limits/pins/system-config
// queries) never resolves in this harness (no fetch mock, `retry: false`),
// so it renders its honest pending/empty state — that state is exactly what
// these tests assert. `AppHeader`'s `operator`/`activeCount` slots are
// optional and `AppShellChrome` never fills them (there is no operator-
// identity/active-run-count source wired up yet) — they're asserted absent,
// not with stale placeholder text.
describe("AppShell", () => {
  it("mounts and renders its children inside the AppFrame main landmark", () => {
    renderWithProviders(
      <AppShell>
        <div>obsah stránky</div>
      </AppShell>,
    );
    expect(screen.getByTestId(AppFrameTestId.Root)).toBeInTheDocument();
    expect(screen.getByText("obsah stránky")).toBeInTheDocument();
  });

  it("mounts the skip link once, pointed at the AppFrame main-content id", () => {
    renderWithProviders(
      <AppShell>
        <div>obsah stránky</div>
      </AppShell>,
    );
    const link = screen.getByTestId(AppFrameTestId.SkipLink);
    expect(link).toHaveRole("link");
    expect(link).toHaveAttribute("href", `#${APP_FRAME_MAIN_CONTENT_ID}`);
  });

  it("renders the header's section nav with all eight sections, and no operator/active-count slot", () => {
    renderWithProviders(
      <AppShell>
        <div>obsah stránky</div>
      </AppShell>,
    );
    expect(screen.getByTestId(AppHeaderTestId.Nav)).toBeInTheDocument();
    for (const id of [
      "dashboard",
      "work",
      "companies",
      "workforce",
      "activity",
      "knowledge",
      "governance",
      "system",
    ]) {
      expect(screen.getByTestId(`${TabsTestId.Tab}-${id}`)).toBeInTheDocument();
    }
    expect(screen.queryByTestId(AppHeaderTestId.Operator)).toBeNull();
    expect(screen.queryByTestId(AppHeaderTestId.ActiveCount)).toBeNull();
  });

  it("labels the AI and Settings sections", () => {
    renderWithProviders(
      <AppShell>
        <div>obsah stránky</div>
      </AppShell>,
    );
    expect(screen.getByTestId(`${TabsTestId.Tab}-workforce`)).toHaveTextContent("AI");
    expect(screen.getByTestId(`${TabsTestId.Tab}-system`)).toHaveTextContent("Nastavení");
  });

  it("renders the light/dark toggle in the header", () => {
    renderWithProviders(
      <AppShell>
        <div>obsah stránky</div>
      </AppShell>,
    );
    expect(screen.getByTestId(AppHeaderTestId.ThemeToggle)).toBeInTheDocument();
  });

  it("renders no settings cog or menu slot in the header", () => {
    renderWithProviders(
      <AppShell>
        <div>obsah stránky</div>
      </AppShell>,
    );
    expect(screen.queryByTestId(AppHeaderTestId.Menu)).toBeNull();
    expect(screen.queryByTestId(MenuButtonTestId.Trigger)).toBeNull();
  });

  it("opens the pin dialog for the current page from the sub-nav pin button", async () => {
    renderWithProviders(
      <AppShell>
        <div>obsah stránky</div>
      </AppShell>,
    );
    expect(screen.queryByTestId(PinPageDialogTestId.Name)).toBeNull();
    await userEvent.click(screen.getByTestId(AppShellTestId.PinToggle));
    expect(screen.getByTestId(PinPageDialogTestId.Name)).toBeInTheDocument();
  });

  it("has no left rail or activity dock", () => {
    renderWithProviders(
      <AppShell>
        <div>obsah stránky</div>
      </AppShell>,
    );
    expect(screen.queryByTestId(AppFrameTestId.Rail)).toBeNull();
  });

  it.each([
    ["/projects/cms4/integrations", "/projects"],
    ["/work/tasks", "/work/tasks"],
  ])("marks the owning sub-nav tab current on %s", (path, href) => {
    mockPath = path;
    try {
      renderWithProviders(
        <AppShell>
          <div>obsah stránky</div>
        </AppShell>,
      );
      expect(screen.getByTestId(`${SubNavTestId.Item}-${href}`)).toHaveAttribute(
        "aria-current",
        "page",
      );
      expect(
        screen
          .getAllByTestId(new RegExp(`^${SubNavTestId.Item}-`))
          .filter((el) => el.getAttribute("aria-current") === "page"),
      ).toHaveLength(1);
    } finally {
      mockPath = "/chat";
    }
  });

  it.each([
    ["/system/registries/hooks/foo", "/system/registries/hooks"],
    ["/system/settings/status", "/system/settings/status"],
    ["/system/registries/mcp/x", "/system/registries/mcp"],
  ])("highlights the owning sub-tab for %s", (path, tabHref) => {
    mockPath = path;
    try {
      renderWithProviders(
        <AppShell>
          <div />
        </AppShell>,
      );
      expect(screen.getByTestId(`${SubNavTestId.Item}-${tabHref}`)).toHaveAttribute(
        "aria-current",
        "page",
      );
    } finally {
      mockPath = "/chat";
    }
  });

  it("shows the sub-nav New task button except on the new-task page itself", () => {
    const { unmount } = renderWithProviders(
      <AppShell>
        <div />
      </AppShell>,
    );
    expect(screen.getByTestId(AppShellTestId.NewTask)).toHaveAccessibleName("Nový úkol");
    unmount();
    mockPath = "/work/tasks/new";
    try {
      renderWithProviders(
        <AppShell>
          <div />
        </AppShell>,
      );
      expect(screen.queryByTestId(AppShellTestId.NewTask)).toBeNull();
    } finally {
      mockPath = "/chat";
    }
  });
});

describe("AppShell top menu sections", () => {
  it.each([
    ["/work/automations", "work"],
    ["/system/registries/skills", "workforce"],
    ["/system/settings/status", "system"],
    ["/workforce/agents/writer", "workforce"],
    ["/governance/spend", "governance"],
  ])("highlights the %s top tab", (path, id) => {
    mockPath = path;
    try {
      renderWithProviders(
        <AppShell>
          <div />
        </AppShell>,
      );
      expect(screen.getByTestId(`${TabsTestId.Tab}-${id}`)).toHaveAttribute(
        "aria-selected",
        "true",
      );
    } finally {
      mockPath = "/chat";
    }
  });
});

describe("AppShell phone layout", () => {
  const renderPhone = (path = "/work/tasks") => {
    mockPhone = true;
    mockPath = path;
    return renderWithProviders(
      <AppShell>
        <div>obsah stránky</div>
      </AppShell>,
    );
  };
  afterEach(() => {
    mockPhone = false;
    mockPath = "/chat";
  });

  it("replaces the header and sub-nav with a toolbar holding the menu and actions", () => {
    renderPhone();
    expect(screen.getByTestId(MobileToolbarTestId.Root)).toBeInTheDocument();
    expect(screen.getByTestId(MobileMenuTestId.Trigger)).toHaveAccessibleName("Menu");
    expect(screen.queryByTestId(AppHeaderTestId.Root)).toBeNull();
    expect(screen.queryByTestId(AppFrameTestId.SubNav)).toBeNull();
    expect(screen.queryByTestId(AppFrameTestId.Rail)).toBeNull();
    const actions = screen.getByTestId(MobileToolbarTestId.Actions);
    expect(actions).toContainElement(screen.getByTestId(AppShellTestId.PinToggle));
    expect(actions).toContainElement(screen.getByTestId(AppShellTestId.NewTask));
    expect(actions).toContainElement(screen.getByTestId(AppShellTestId.PageActions));
  });

  it("opens the section tree with the active section expanded", async () => {
    renderPhone();
    await userEvent.click(screen.getByTestId(MobileMenuTestId.Trigger));
    expect(screen.getByTestId(`${MobileMenuTestId.Item}-/work/tasks`)).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("hides the new-task button on the new-task page", () => {
    renderPhone("/work/tasks/new");
    expect(screen.queryByTestId(AppShellTestId.NewTask)).toBeNull();
  });
});
