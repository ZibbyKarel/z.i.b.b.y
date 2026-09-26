import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { render } from "../../utils/testRender";
import { CommandPalette, type CommandPaletteGroup, CommandPaletteTestId } from "./CommandPalette";

const groups: CommandPaletteGroup[] = [
  {
    label: "Pages",
    items: [{ id: "overview", kind: "PAGE", label: "Overview", meta: "⌘1" }],
  },
  {
    label: "Agents",
    items: [{ id: "kevin", kind: "AGENT", label: "Kevin", meta: "RND" }],
  },
];

describe("CommandPalette", () => {
  it("renders nothing when closed", () => {
    render(
      <CommandPalette
        groups={groups}
        onOpenChange={() => {}}
        onQueryChange={() => {}}
        open={false}
        query=""
      />,
    );
    expect(screen.queryByTestId(CommandPaletteTestId.Root)).toBeNull();
  });

  it("renders every group and item when open", () => {
    render(
      <CommandPalette
        open
        groups={groups}
        onOpenChange={() => {}}
        onQueryChange={() => {}}
        query="s"
      />,
    );
    expect(screen.getByTestId(`${CommandPaletteTestId.Item}-overview`)).toHaveTextContent(
      "Overview",
    );
    expect(screen.getByTestId(`${CommandPaletteTestId.Item}-kevin`)).toHaveTextContent("Kevin");
  });

  it("calls onQueryChange as the input changes", async () => {
    const onQueryChange = vi.fn();
    render(
      <CommandPalette
        open
        groups={groups}
        onOpenChange={() => {}}
        onQueryChange={onQueryChange}
        query=""
      />,
    );
    await userEvent.type(screen.getByTestId(CommandPaletteTestId.Input), "s");
    expect(onQueryChange).toHaveBeenCalledWith("s");
  });

  it("shows the empty state for a non-empty query with no hits", () => {
    render(
      <CommandPalette
        open
        emptyLabel="Nothing found"
        groups={[]}
        onOpenChange={() => {}}
        onQueryChange={() => {}}
        query="zzz"
      />,
    );
    expect(screen.getByTestId(CommandPaletteTestId.Empty)).toHaveTextContent("Nothing found");
  });

  it("shows a spinner while loading", () => {
    render(
      <CommandPalette
        loading
        open
        groups={groups}
        onOpenChange={() => {}}
        onQueryChange={() => {}}
        query=""
      />,
    );
    expect(screen.getByTestId(CommandPaletteTestId.Spinner)).toBeInTheDocument();
  });

  it("calls onOpenChange(false) and the item's onSelect on click", async () => {
    const onOpenChange = vi.fn();
    const onSelect = vi.fn();
    const clickGroups: CommandPaletteGroup[] = [
      { label: "Pages", items: [{ id: "overview", kind: "PAGE", label: "Overview", onSelect }] },
    ];
    render(
      <CommandPalette
        open
        groups={clickGroups}
        onOpenChange={onOpenChange}
        onQueryChange={() => {}}
        query="o"
      />,
    );
    await userEvent.click(screen.getByTestId(`${CommandPaletteTestId.Item}-overview`));
    expect(onSelect).toHaveBeenCalledOnce();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("moves the active row with ArrowDown/ArrowUp and selects it on Enter", async () => {
    const onOpenChange = vi.fn();
    const onSelectKevin = vi.fn();
    const keyGroups: CommandPaletteGroup[] = [
      { label: "Pages", items: [{ id: "overview", kind: "PAGE", label: "Overview" }] },
      {
        label: "Agents",
        items: [{ id: "kevin", kind: "AGENT", label: "Kevin", onSelect: onSelectKevin }],
      },
    ];
    render(
      <CommandPalette
        open
        groups={keyGroups}
        onOpenChange={onOpenChange}
        onQueryChange={() => {}}
        query="s"
      />,
    );
    const input = screen.getByTestId(CommandPaletteTestId.Input);
    input.focus();
    await userEvent.keyboard("{ArrowDown}{Enter}");
    expect(onSelectKevin).toHaveBeenCalledOnce();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("calls onOpenChange(false) on Escape", async () => {
    const onOpenChange = vi.fn();
    render(
      <CommandPalette
        open
        groups={groups}
        onOpenChange={onOpenChange}
        onQueryChange={() => {}}
        query=""
      />,
    );
    await userEvent.keyboard("{Escape}");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("focuses the input on open", () => {
    render(
      <CommandPalette
        open
        groups={groups}
        onOpenChange={() => {}}
        onQueryChange={() => {}}
        query=""
      />,
    );
    expect(screen.getByTestId(CommandPaletteTestId.Input)).toHaveFocus();
  });

  it("gives the root dialog an accessible name", () => {
    render(
      <CommandPalette
        open
        ariaLabel="Jump to"
        groups={groups}
        onOpenChange={() => {}}
        onQueryChange={() => {}}
        query=""
      />,
    );
    expect(screen.getByTestId(CommandPaletteTestId.Root)).toHaveAccessibleName("Jump to");
  });
});
