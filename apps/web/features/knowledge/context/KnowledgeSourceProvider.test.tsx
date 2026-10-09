import { useState } from "react";
import { fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders as render, screen } from "../../../test/render";
import { KnowledgeSourceProvider } from "./KnowledgeSourceProvider";
import { useKnowledgeSource } from "./useKnowledgeSource";

const replace = vi.fn();
let pathname = "/knowledge/graph";
let search = "";
let teamsData: unknown = [
  { id: "devrel", name: "DevRel", knowledgeBase: { kind: "vault", path: "/x" } },
  { id: "nokb", name: "NoKb" },
];

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => pathname,
  useSearchParams: () => new URLSearchParams(search),
}));
vi.mock("../../teams/queries", () => ({ useTeamsQuery: () => ({ data: teamsData }) }));

function Probe() {
  const { source, kbTeams, setSource } = useKnowledgeSource();
  return (
    <div>
      <span data-testid="source">{source}</span>
      <span data-testid="teams">{kbTeams.map((t) => t.id).join(",")}</span>
      <button data-testid="pick" onClick={() => setSource("team:devrel")} type="button" />
    </div>
  );
}

/** A child that can be unmounted/remounted while the provider stays mounted (a tab switch). */
function Tabs() {
  const [shown, setShown] = useState(true);
  return (
    <>
      <button data-testid="toggle" onClick={() => setShown((s) => !s)} type="button" />
      {shown && <Probe />}
    </>
  );
}

describe("KnowledgeSourceProvider", () => {
  beforeEach(() => {
    replace.mockReset();
    pathname = "/knowledge/graph";
    search = "";
    teamsData = [
      { id: "devrel", name: "DevRel", knowledgeBase: { kind: "vault", path: "/x" } },
      { id: "nokb", name: "NoKb" },
    ];
  });

  it("defaults to the vault and lists only teams with a KB", () => {
    render(
      <KnowledgeSourceProvider>
        <Probe />
      </KnowledgeSourceProvider>,
    );
    expect(screen.getByTestId("source")).toHaveTextContent("vault");
    expect(screen.getByTestId("teams")).toHaveTextContent("devrel");
    expect(replace).not.toHaveBeenCalled();
  });

  it("initialises from ?source=", () => {
    search = "source=team%3Adevrel";
    render(
      <KnowledgeSourceProvider>
        <Probe />
      </KnowledgeSourceProvider>,
    );
    expect(screen.getByTestId("source")).toHaveTextContent("team:devrel");
  });

  it("falls back to the vault for an unknown team or one without a KB", () => {
    for (const bad of ["team:ghost", "team:nokb"]) {
      search = `source=${encodeURIComponent(bad)}`;
      const { unmount } = render(
        <KnowledgeSourceProvider>
          <Probe />
        </KnowledgeSourceProvider>,
      );
      expect(screen.getByTestId("source")).toHaveTextContent("vault");
      unmount();
    }
    // …and the stale param is dropped from the URL, without scrolling.
    expect(replace).toHaveBeenCalledWith("/knowledge/graph", { scroll: false });
  });

  it("writes the selection into the URL, keeping other params", () => {
    search = "note=a.md";
    render(
      <KnowledgeSourceProvider>
        <Probe />
      </KnowledgeSourceProvider>,
    );
    fireEvent.click(screen.getByTestId("pick"));
    expect(screen.getByTestId("source")).toHaveTextContent("team:devrel");
    expect(replace).toHaveBeenCalledWith("/knowledge/graph?note=a.md&source=team%3Adevrel", {
      scroll: false,
    });
  });

  it("survives a child remount and re-applies the param a tab link dropped", () => {
    search = "source=team%3Adevrel";
    const { rerender } = render(
      <KnowledgeSourceProvider>
        <Tabs />
      </KnowledgeSourceProvider>,
    );
    fireEvent.click(screen.getByTestId("toggle"));
    fireEvent.click(screen.getByTestId("toggle"));
    expect(screen.getByTestId("source")).toHaveTextContent("team:devrel");

    // Tab navigation: new pathname, query string gone.
    pathname = "/knowledge/vault";
    search = "";
    rerender(
      <KnowledgeSourceProvider>
        <Tabs />
      </KnowledgeSourceProvider>,
    );
    expect(screen.getByTestId("source")).toHaveTextContent("team:devrel");
    expect(replace).toHaveBeenLastCalledWith("/knowledge/vault?source=team%3Adevrel", {
      scroll: false,
    });
  });

  it("lets an explicit ?source= link override the current selection", () => {
    search = "source=team%3Adevrel";
    const { rerender } = render(
      <KnowledgeSourceProvider>
        <Probe />
      </KnowledgeSourceProvider>,
    );
    teamsData = [
      { id: "devrel", name: "DevRel", knowledgeBase: { kind: "vault", path: "/x" } },
      { id: "other", name: "Other", knowledgeBase: { kind: "vault", path: "/y" } },
    ];
    search = "source=team%3Aother";
    rerender(
      <KnowledgeSourceProvider>
        <Probe />
      </KnowledgeSourceProvider>,
    );
    expect(screen.getByTestId("source")).toHaveTextContent("team:other");
  });
});
