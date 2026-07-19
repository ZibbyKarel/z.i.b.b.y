import { describe, expect, it } from "vitest";
import { MAIN_CONTENT_ID } from "@zibby/design-system";
import { renderWithProviders, screen } from "../../../test/render";
import { SkipLinkTestId } from "../SkipLink/SkipLink";
import { AppShell } from "./AppShell";

// F10 (docs/hud2chat/DECISIONS.md, O2): the HUD chrome (`MainLayout`/`Sidebar`/
// `RightRail`/`TopBar`) and the route-mode fork that used to choose between it
// and the immersive shell are both deleted — every route renders fullscreen
// now. `AppShell` is left as the provider stack (catalog/new-task/chat) around
// a full-height container. `usePathname`/`useRouter` come from the global
// `next/navigation` mock in `vitest.setup.tsx` — nothing here depends on the
// route.
describe("AppShell", () => {
  it("mounts and renders its children", () => {
    renderWithProviders(
      <AppShell>
        <div>obsah stránky</div>
      </AppShell>,
    );
    expect(screen.getByText("obsah stránky")).toBeInTheDocument();
  });

  it("renders no HUD nav-rail landmark — the old shell is gone", () => {
    renderWithProviders(
      <AppShell>
        <div>obsah stránky</div>
      </AppShell>,
    );
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });

  it("mounts the skip link once, pointed at the shared main-content id (F10b)", () => {
    renderWithProviders(
      <AppShell>
        <div>obsah stránky</div>
      </AppShell>,
    );
    const link = screen.getByTestId(SkipLinkTestId.Root);
    expect(link).toHaveRole("link");
    expect(link).toHaveAccessibleName("Přeskočit na obsah");
    expect(link).toHaveAttribute("href", `#${MAIN_CONTENT_ID}`);
  });
});
