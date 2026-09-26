import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { IconTileTestId } from "../IconTile/IconTile";
import { EntityCard, EntityCardTestId } from "./EntityCard";

describe("EntityCard", () => {
  it("renders the title and description", () => {
    render(<EntityCard description="dělá věci" title="reviewer" />);
    expect(screen.getByTestId(EntityCardTestId.Title)).toHaveTextContent("reviewer");
    expect(screen.getByTestId(EntityCardTestId.Description)).toHaveTextContent("dělá věci");
  });

  it("renders the subtitle meta line and the header aside", () => {
    render(
      <EntityCard aside={<span>připojeno</span>} subtitle="~/Projects/zibby" title="reviewer" />,
    );
    expect(screen.getByTestId(EntityCardTestId.Subtitle)).toHaveTextContent("~/Projects/zibby");
    expect(screen.getByTestId(EntityCardTestId.Aside)).toHaveTextContent("připojeno");
  });

  it("renders badge rows and skips empty rows", () => {
    render(<EntityCard badges={[[<span key="a">sonnet</span>], [null, false]]} title="reviewer" />);
    expect(screen.getByTestId(`${EntityCardTestId.BadgeRow}-0`)).toHaveTextContent("sonnet");
    expect(screen.queryByTestId(`${EntityCardTestId.BadgeRow}-1`)).toBeNull();
  });

  it("renders footer actions", () => {
    render(<EntityCard actions={<button>Spustit</button>} title="reviewer" />);
    expect(screen.getByTestId(EntityCardTestId.Actions)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Spustit" })).toBeInTheDocument();
  });

  it("opens the body when onClick is provided", () => {
    const onClick = vi.fn();
    render(<EntityCard onClick={onClick} openLabel="otevřít reviewer" title="reviewer" />);
    const open = screen.getByTestId(EntityCardTestId.Open);
    expect(open).toHaveRole("button");
    expect(open).toHaveAccessibleName("otevřít reviewer");
    fireEvent.click(open);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("renders the custom logo, defaulting its alt text to the title", () => {
    render(<EntityCard logoSrc="data:image/png;base64,AAA" title="media-vault" />);
    const img = screen.getByTestId(IconTileTestId.Image);
    expect(img).toHaveAccessibleName("media-vault");
    expect(img).toHaveAttribute("src", "data:image/png;base64,AAA");
  });

  it("falls back to the glyph when no logo is set", () => {
    render(<EntityCard title="reviewer" />);
    expect(screen.queryByTestId(IconTileTestId.Image)).toBeNull();
  });
});
