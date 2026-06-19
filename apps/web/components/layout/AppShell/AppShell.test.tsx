import { describe, expect, it } from "vitest";
import { renderWithProviders, screen } from "../../../test/render";
import { AppShell } from "./AppShell";

// Smoke test only: AppShell wires routing (usePathname), the catalog provider
// and Suspense around MainLayout. next/navigation is stubbed globally in the
// component test setup, so the active nav resolves to the default overview.
describe("AppShell", () => {
  it("mounts and renders its children", () => {
    renderWithProviders(
      <AppShell>
        <div>obsah dashboardu</div>
      </AppShell>,
    );
    expect(screen.getByText("obsah dashboardu")).toBeInTheDocument();
  });
});
