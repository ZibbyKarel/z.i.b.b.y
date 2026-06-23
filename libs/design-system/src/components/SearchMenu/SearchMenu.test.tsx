import { type Ref, useState } from "react";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { render } from "../../utils/testRender";
import { SearchMenu, type SearchMenuSection, SearchMenuTestId } from "./SearchMenu";

const SECTIONS: SearchMenuSection[] = [
  {
    id: "agents",
    label: "Agents",
    items: [
      { id: "writer", title: "Writer", subtitle: "Writes things", glyph: "bot" },
      { id: "reviewer", title: "Reviewer", glyph: "bot" },
    ],
  },
  {
    id: "skills",
    label: "Skills",
    items: [{ id: "summarize", title: "Summarize", glyph: "spark" }],
  },
];

/** Controlled harness so the input reflects typed text and the panel can open. */
function Harness({
  sections = SECTIONS,
  onSelect = vi.fn(),
  loading = false,
  emptyLabel,
  inputRef,
}: {
  sections?: SearchMenuSection[];
  onSelect?: (sectionId: string, itemId: string) => void;
  loading?: boolean;
  emptyLabel?: string;
  inputRef?: Ref<HTMLInputElement>;
}) {
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  return (
    <SearchMenu
      ariaLabel="Search"
      emptyLabel={emptyLabel}
      inputRef={inputRef}
      loading={loading}
      onOpenChange={setOpen}
      onSelect={onSelect}
      onValueChange={setValue}
      open={open}
      placeholder="Search…"
      sections={sections}
      shortcut="⌘K"
      value={value}
    />
  );
}

describe("SearchMenu", () => {
  it("renders an accessible combobox input with the placeholder", () => {
    render(<Harness />);
    const input = screen.getByTestId(SearchMenuTestId.Input);
    expect(input).toHaveRole("combobox");
    expect(input).toHaveAccessibleName("Search");
    expect(input).toHaveAttribute("placeholder", "Search…");
  });

  it("forwards inputRef to the underlying input (so a ⌘K handler can focus it)", () => {
    const ref = { current: null as HTMLInputElement | null };
    render(<Harness inputRef={ref} />);
    expect(ref.current).toBe(screen.getByTestId(SearchMenuTestId.Input));
    ref.current?.focus();
    expect(screen.getByTestId(SearchMenuTestId.Input)).toHaveFocus();
  });

  it("keeps the panel closed until there is a query", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByTestId(SearchMenuTestId.Input));
    // Focused but empty → no panel.
    expect(screen.queryByTestId(SearchMenuTestId.Panel)).not.toBeInTheDocument();
  });

  it("opens a categorized panel once the user types", async () => {
    render(<Harness />);
    await userEvent.type(screen.getByTestId(SearchMenuTestId.Input), "wr");
    expect(screen.getByTestId(SearchMenuTestId.Panel)).toBeInTheDocument();
    expect(screen.getByTestId(`${SearchMenuTestId.SectionLabel}-agents`)).toHaveTextContent(
      "Agents",
    );
    expect(screen.getByTestId(`${SearchMenuTestId.Item}-agents-writer`)).toHaveTextContent(
      "Writer",
    );
    expect(screen.getByTestId(`${SearchMenuTestId.Item}-skills-summarize`)).toBeInTheDocument();
  });

  it("selects a result on click", async () => {
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);
    await userEvent.type(screen.getByTestId(SearchMenuTestId.Input), "x");
    await userEvent.click(screen.getByTestId(`${SearchMenuTestId.Item}-skills-summarize`));
    expect(onSelect).toHaveBeenCalledWith("skills", "summarize");
  });

  it("moves the active row with ArrowDown and selects it with Enter", async () => {
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);
    const input = screen.getByTestId(SearchMenuTestId.Input);
    await userEvent.type(input, "x");
    // First row (agents/writer) is active by default; ArrowDown → reviewer.
    await userEvent.keyboard("{ArrowDown}{Enter}");
    expect(onSelect).toHaveBeenCalledWith("agents", "reviewer");
  });

  it("closes the panel on Escape", async () => {
    render(<Harness />);
    const input = screen.getByTestId(SearchMenuTestId.Input);
    await userEvent.type(input, "wr");
    expect(screen.getByTestId(SearchMenuTestId.Panel)).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByTestId(SearchMenuTestId.Panel)).not.toBeInTheDocument();
  });

  it("shows the empty label when a query yields no hits", async () => {
    render(<Harness emptyLabel="No results" sections={[]} />);
    await userEvent.type(screen.getByTestId(SearchMenuTestId.Input), "zzz");
    expect(screen.getByTestId(SearchMenuTestId.Empty)).toHaveTextContent("No results");
  });

  it("shows a spinner instead of the shortcut while loading", async () => {
    render(<Harness loading sections={[]} />);
    await userEvent.type(screen.getByTestId(SearchMenuTestId.Input), "zzz");
    expect(screen.getByTestId(SearchMenuTestId.Spinner)).toBeInTheDocument();
    expect(screen.queryByTestId(SearchMenuTestId.Shortcut)).not.toBeInTheDocument();
  });

  it("shows the shortcut hint only when idle and empty", () => {
    render(<Harness />);
    expect(screen.getByTestId(SearchMenuTestId.Shortcut)).toHaveTextContent("⌘K");
  });
});
