import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GridTestId } from "@zibby/design-system";
import { Collection } from "./Collection";
import { LoadErrorTestId } from "../LoadError/LoadError";
import { LoadingStateTestId } from "../LoadingState/LoadingState";

const empty = {
  glyph: "spark",
  title: "Zatím žádné skilly",
  description: "Vytvoř první SKILL.md.",
} as const;

describe("Collection", () => {
  it("renders items in a grid when present", () => {
    render(
      <Collection
        empty={empty}
        items={["rohlik", "wolt"]}
        renderItem={(name) => <div key={name}>{name}</div>}
      />,
    );
    expect(screen.getByTestId(GridTestId.Root)).toBeInTheDocument();
    expect(screen.getByText("rohlik")).toBeInTheDocument();
    expect(screen.getByText("wolt")).toBeInTheDocument();
  });

  it("renders the empty state when there are no items", () => {
    render(
      <Collection
        empty={empty}
        items={[]}
        renderItem={(name: string) => <div key={name}>{name}</div>}
      />,
    );
    expect(screen.queryByTestId(GridTestId.Root)).toBeNull();
    expect(screen.getByText("Zatím žádné skilly")).toBeInTheDocument();
  });

  it("renders the load error (over the empty state) when error is set", () => {
    render(
      <Collection
        empty={empty}
        error={{
          title: "Couldn't load",
          description: "API down",
          retryLabel: "Retry",
          onRetry: () => {},
        }}
        items={[]}
        renderItem={(name: string) => <div key={name}>{name}</div>}
      />,
    );
    expect(screen.getByTestId(LoadErrorTestId.Root)).toBeInTheDocument();
    // The empty state must NOT show during an outage.
    expect(screen.queryByText("Zatím žádné skilly")).toBeNull();
  });

  it("renders the loading state (over error and empty) while loading", () => {
    render(
      <Collection
        empty={empty}
        error={{ title: "Couldn't load", description: "x", onRetry: () => {} }}
        items={[]}
        loading={{ label: "Načítání…" }}
        renderItem={(name: string) => <div key={name}>{name}</div>}
      />,
    );
    expect(screen.getByTestId(LoadingStateTestId.Root)).toBeInTheDocument();
    expect(screen.queryByTestId(LoadErrorTestId.Root)).toBeNull();
    expect(screen.queryByText("Zatím žádné skilly")).toBeNull();
  });
});
