import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, renderWithProviders, screen } from "../../../test/render";
import { ACTIVE_PROJECT_COOKIE, ProjectProvider, useActiveProject } from "./ProjectProvider";

// The provider validates the cookie against the project registry; a mutable
// fixture lets each test choose what "exists".
const { registry } = vi.hoisted(() => ({
  registry: { data: undefined as Array<{ id: string; name: string }> | undefined },
}));
vi.mock("../queries", () => ({
  useProjectsQuery: () => ({ data: registry.data }),
}));

/** Minimal consumer: shows the active id and can switch/clear it. */
function Probe() {
  const { activeProjectId, setActiveProject } = useActiveProject();
  return (
    <div>
      <span data-testid="active-project-value">{activeProjectId ?? "(null)"}</span>
      <button data-testid="set-alpha" onClick={() => setActiveProject("alpha")} type="button">
        alpha
      </button>
      <button data-testid="set-null" onClick={() => setActiveProject(null)} type="button">
        all
      </button>
    </div>
  );
}

function renderProbe() {
  return renderWithProviders(
    <ProjectProvider>
      <Probe />
    </ProjectProvider>,
  );
}

describe("ProjectProvider", () => {
  beforeEach(() => {
    // jsdom cookies persist across tests — expire ours between runs.
    document.cookie = `${ACTIVE_PROJECT_COOKIE}=; path=/; max-age=0`;
    registry.data = [
      { id: "alpha", name: "Alpha" },
      { id: "beta", name: "Beta" },
    ];
  });

  it("defaults to null (Všechny projekty) with no cookie", () => {
    renderProbe();
    expect(screen.getByTestId("active-project-value")).toHaveTextContent("(null)");
  });

  it("reads the persisted selection from the activeProject cookie", () => {
    document.cookie = `${ACTIVE_PROJECT_COOKIE}=beta; path=/`;
    renderProbe();
    expect(screen.getByTestId("active-project-value")).toHaveTextContent("beta");
  });

  it("setActiveProject updates the context and writes the cookie", () => {
    renderProbe();
    fireEvent.click(screen.getByTestId("set-alpha"));
    expect(screen.getByTestId("active-project-value")).toHaveTextContent("alpha");
    expect(document.cookie).toContain(`${ACTIVE_PROJECT_COOKIE}=alpha`);

    fireEvent.click(screen.getByTestId("set-null"));
    expect(screen.getByTestId("active-project-value")).toHaveTextContent("(null)");
    // Clearing persists as an empty value ("Všechny projekty"), not a delete.
    expect(document.cookie).not.toContain(`${ACTIVE_PROJECT_COOKIE}=alpha`);
  });

  it("treats a cookie pointing at an unknown project as null WITHOUT clearing it", () => {
    document.cookie = `${ACTIVE_PROJECT_COOKIE}=ghost; path=/`;
    renderProbe();
    expect(screen.getByTestId("active-project-value")).toHaveTextContent("(null)");
    // The cookie survives — the project may just not be loaded/synced yet.
    expect(document.cookie).toContain(`${ACTIVE_PROJECT_COOKIE}=ghost`);
  });

  it("keeps the raw selection while the registry is still loading", () => {
    registry.data = undefined;
    document.cookie = `${ACTIVE_PROJECT_COOKIE}=beta; path=/`;
    renderProbe();
    // No registry yet → no basis to call the id unknown; the selection holds.
    expect(screen.getByTestId("active-project-value")).toHaveTextContent("beta");
  });
});
