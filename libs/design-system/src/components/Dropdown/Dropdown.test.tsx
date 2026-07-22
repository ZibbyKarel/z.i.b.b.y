import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Dropdown, DropdownTestId } from "./Dropdown";

const OPTIONS = [
  { value: "cs", label: "Čeština", code: "CZ" },
  { value: "en", label: "English", code: "EN" },
];

describe("Dropdown", () => {
  it("renders trigger with current option", () => {
    render(<Dropdown onChange={vi.fn()} options={OPTIONS} value="cs" />);
    const trigger = screen.getByTestId(DropdownTestId.Trigger);
    expect(trigger).toHaveTextContent("CZ");
    expect(trigger).toHaveTextContent("Čeština");
  });

  it("applies compact padding in size=sm", () => {
    const { rerender } = render(
      <Dropdown onChange={vi.fn()} options={OPTIONS} size="sm" value="cs" />,
    );
    expect(screen.getByTestId(DropdownTestId.Trigger)).toHaveClass("text-sm");
    rerender(<Dropdown onChange={vi.fn()} options={OPTIONS} value="cs" />);
    expect(screen.getByTestId(DropdownTestId.Trigger)).toHaveClass("text-base");
  });

  it("is collapsed by default", () => {
    render(<Dropdown onChange={vi.fn()} options={OPTIONS} value="cs" />);
    expect(screen.getByTestId(DropdownTestId.Trigger)).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId(DropdownTestId.Panel)).not.toBeInTheDocument();
  });

  it("opens panel on trigger click", async () => {
    const user = userEvent.setup();
    render(<Dropdown onChange={vi.fn()} options={OPTIONS} value="cs" />);
    await user.click(screen.getByTestId(DropdownTestId.Trigger));
    expect(screen.getByTestId(DropdownTestId.Trigger)).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId(DropdownTestId.Panel)).toBeInTheDocument();
    expect(screen.getByTestId(DropdownTestId.Panel)).toHaveRole("listbox");
  });

  it("renders all options with correct aria-selected", async () => {
    const user = userEvent.setup();
    render(<Dropdown onChange={vi.fn()} options={OPTIONS} value="cs" />);
    await user.click(screen.getByTestId(DropdownTestId.Trigger));
    const opts = screen.getAllByTestId(DropdownTestId.Option);
    expect(opts).toHaveLength(2);
    expect(opts[0]).toHaveAttribute("aria-selected", "true");
    expect(opts[1]).toHaveAttribute("aria-selected", "false");
  });

  it("calls onChange and closes panel when option is clicked", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Dropdown onChange={onChange} options={OPTIONS} value="cs" />);
    await user.click(screen.getByTestId(DropdownTestId.Trigger));
    const opts = screen.getAllByTestId(DropdownTestId.Option);
    await user.click(opts[1]!);
    expect(onChange).toHaveBeenCalledWith("en");
    expect(screen.queryByTestId(DropdownTestId.Panel)).not.toBeInTheDocument();
  });

  it("closes panel on Escape key", async () => {
    const user = userEvent.setup();
    render(<Dropdown onChange={vi.fn()} options={OPTIONS} value="cs" />);
    await user.click(screen.getByTestId(DropdownTestId.Trigger));
    expect(screen.getByTestId(DropdownTestId.Panel)).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByTestId(DropdownTestId.Panel)).not.toBeInTheDocument();
  });

  it("forwards aria-label to trigger", () => {
    render(
      <Dropdown aria-label="Jazyk rozhraní" onChange={vi.fn()} options={OPTIONS} value="cs" />,
    );
    expect(screen.getByTestId(DropdownTestId.Trigger)).toHaveAccessibleName("Jazyk rozhraní");
  });

  it("opens with ArrowDown and points aria-activedescendant at the selected row", async () => {
    const user = userEvent.setup();
    render(<Dropdown onChange={vi.fn()} options={OPTIONS} value="cs" />);
    const trigger = screen.getByTestId(DropdownTestId.Trigger);
    trigger.focus();
    await user.keyboard("{ArrowDown}");
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const opts = screen.getAllByTestId(DropdownTestId.Option);
    // The selected option ("cs") is the initial active row.
    expect(trigger).toHaveAttribute("aria-activedescendant", opts[0]!.id);
  });

  it("moves the active row with ArrowDown and selects it with Enter", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Dropdown onChange={onChange} options={OPTIONS} value="cs" />);
    const trigger = screen.getByTestId(DropdownTestId.Trigger);
    trigger.focus();
    await user.keyboard("{ArrowDown}"); // open, active = cs (index 0)
    await user.keyboard("{ArrowDown}"); // active = en (index 1)
    const opts = screen.getAllByTestId(DropdownTestId.Option);
    expect(trigger).toHaveAttribute("aria-activedescendant", opts[1]!.id);
    await user.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledWith("en");
    expect(screen.queryByTestId(DropdownTestId.Panel)).not.toBeInTheDocument();
  });

  it("wraps from the last row back to the first with ArrowDown", async () => {
    const user = userEvent.setup();
    render(<Dropdown onChange={vi.fn()} options={OPTIONS} value="en" />);
    const trigger = screen.getByTestId(DropdownTestId.Trigger);
    trigger.focus();
    await user.keyboard("{ArrowDown}"); // open, active = en (index 1, selected)
    await user.keyboard("{ArrowDown}"); // wrap to index 0
    const opts = screen.getAllByTestId(DropdownTestId.Option);
    expect(trigger).toHaveAttribute("aria-activedescendant", opts[0]!.id);
  });

  it("compact single trigger shows only the code, not the label", () => {
    render(<Dropdown compact onChange={vi.fn()} options={OPTIONS} value="cs" />);
    const trigger = screen.getByTestId(DropdownTestId.Trigger);
    expect(trigger).toHaveTextContent("CZ");
    expect(trigger).not.toHaveTextContent("Čeština");
  });

  it("compact trigger still lists full labels in the open menu", async () => {
    render(<Dropdown compact onChange={vi.fn()} options={OPTIONS} value="cs" />);
    await userEvent.click(screen.getByTestId(DropdownTestId.Trigger));
    expect(screen.getByTestId(DropdownTestId.Panel)).toHaveTextContent("English");
  });

  it("renders an option's description as sub-text when present", async () => {
    const user = userEvent.setup();
    const optionsWithDescription = [
      { value: "cs", label: "Čeština", code: "CZ", description: "Výchozí jazyk" },
      { value: "en", label: "English", code: "EN" },
    ];
    render(<Dropdown onChange={vi.fn()} options={optionsWithDescription} value="cs" />);
    await user.click(screen.getByTestId(DropdownTestId.Trigger));
    const opts = screen.getAllByTestId(DropdownTestId.Option);
    expect(opts[0]).toHaveTextContent("Výchozí jazyk");
    expect(opts[1]).not.toHaveTextContent("Výchozí jazyk");
  });

  describe("multi mode", () => {
    it("renders the trigger as a combobox with a chip per selected value", () => {
      render(<Dropdown multi onChange={vi.fn()} options={OPTIONS} value={["cs", "en"]} />);
      const trigger = screen.getByTestId(DropdownTestId.Trigger);
      expect(trigger).toHaveRole("combobox");
      expect(screen.getByTestId(`${DropdownTestId.Chip}-cs`)).toHaveTextContent("Čeština");
      expect(screen.getByTestId(`${DropdownTestId.Chip}-en`)).toHaveTextContent("English");
    });

    it("shows the placeholder when nothing is selected", () => {
      render(
        <Dropdown
          multi
          onChange={vi.fn()}
          options={OPTIONS}
          placeholder="Vyber jazyky"
          value={[]}
        />,
      );
      expect(screen.getByTestId(DropdownTestId.Trigger)).toHaveTextContent("Vyber jazyky");
    });

    it("marks the listbox multiselectable and reflects selection via aria-selected", async () => {
      const user = userEvent.setup();
      render(<Dropdown multi onChange={vi.fn()} options={OPTIONS} value={["cs"]} />);
      await user.click(screen.getByTestId(DropdownTestId.Trigger));
      expect(screen.getByTestId(DropdownTestId.Panel)).toHaveAttribute(
        "aria-multiselectable",
        "true",
      );
      const opts = screen.getAllByTestId(DropdownTestId.Option);
      expect(opts[0]).toHaveAttribute("aria-selected", "true");
      expect(opts[1]).toHaveAttribute("aria-selected", "false");
    });

    it("adds a value and keeps the menu open when an unselected option is clicked", async () => {
      const onChange = vi.fn();
      const user = userEvent.setup();
      render(<Dropdown multi onChange={onChange} options={OPTIONS} value={["cs"]} />);
      await user.click(screen.getByTestId(DropdownTestId.Trigger));
      await user.click(screen.getAllByTestId(DropdownTestId.Option)[1]!);
      expect(onChange).toHaveBeenCalledWith(["cs", "en"]);
      expect(screen.getByTestId(DropdownTestId.Panel)).toBeInTheDocument();
    });

    it("removes an already-selected value when its option is clicked", async () => {
      const onChange = vi.fn();
      const user = userEvent.setup();
      render(<Dropdown multi onChange={onChange} options={OPTIONS} value={["cs", "en"]} />);
      await user.click(screen.getByTestId(DropdownTestId.Trigger));
      await user.click(screen.getAllByTestId(DropdownTestId.Option)[0]!);
      expect(onChange).toHaveBeenCalledWith(["en"]);
    });

    it("toggles the active row with Enter and keeps the menu open", async () => {
      const onChange = vi.fn();
      const user = userEvent.setup();
      render(<Dropdown multi onChange={onChange} options={OPTIONS} value={["cs"]} />);
      const trigger = screen.getByTestId(DropdownTestId.Trigger);
      trigger.focus();
      await user.keyboard("{ArrowDown}"); // open, active = cs (index 0)
      await user.keyboard("{ArrowDown}"); // active = en (index 1)
      await user.keyboard("{Enter}");
      expect(onChange).toHaveBeenCalledWith(["cs", "en"]);
      expect(screen.getByTestId(DropdownTestId.Panel)).toBeInTheDocument();
    });

    it("removes a value via its chip close button without opening the menu", async () => {
      const onChange = vi.fn();
      const user = userEvent.setup();
      render(<Dropdown multi onChange={onChange} options={OPTIONS} value={["cs", "en"]} />);
      const chip = screen.getByTestId(`${DropdownTestId.Chip}-cs`);
      await user.click(within(chip).getByRole("button"));
      expect(onChange).toHaveBeenCalledWith(["en"]);
      expect(screen.queryByTestId(DropdownTestId.Panel)).not.toBeInTheDocument();
    });

    describe("showSelectAll", () => {
      it("renders no select-all row unless showSelectAll is set", async () => {
        const user = userEvent.setup();
        render(<Dropdown multi onChange={vi.fn()} options={OPTIONS} value={[]} />);
        await user.click(screen.getByTestId(DropdownTestId.Trigger));
        expect(screen.queryByTestId(DropdownTestId.SelectAll)).not.toBeInTheDocument();
      });

      it("renders a select-all row before the options when partially selected", async () => {
        const user = userEvent.setup();
        render(
          <Dropdown multi showSelectAll onChange={vi.fn()} options={OPTIONS} value={["cs"]} />,
        );
        await user.click(screen.getByTestId(DropdownTestId.Trigger));
        const row = screen.getByTestId(DropdownTestId.SelectAll);
        expect(row).toHaveTextContent("Select all");
        expect(row).toHaveAttribute("aria-selected", "false");
        // It precedes the first option in the DOM.
        const firstOption = screen.getAllByTestId(DropdownTestId.Option)[0]!;
        expect(row.compareDocumentPosition(firstOption)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
      });

      it("selects every option when the select-all row is clicked", async () => {
        const onChange = vi.fn();
        const user = userEvent.setup();
        render(
          <Dropdown multi showSelectAll onChange={onChange} options={OPTIONS} value={["cs"]} />,
        );
        await user.click(screen.getByTestId(DropdownTestId.Trigger));
        await user.click(screen.getByTestId(DropdownTestId.SelectAll));
        expect(onChange).toHaveBeenCalledWith(["cs", "en"]);
        expect(screen.getByTestId(DropdownTestId.Panel)).toBeInTheDocument();
      });

      it("shows the clear-all label and clears when everything is selected", async () => {
        const onChange = vi.fn();
        const user = userEvent.setup();
        render(
          <Dropdown
            multi
            showSelectAll
            onChange={onChange}
            options={OPTIONS}
            value={["cs", "en"]}
          />,
        );
        await user.click(screen.getByTestId(DropdownTestId.Trigger));
        const row = screen.getByTestId(DropdownTestId.SelectAll);
        expect(row).toHaveTextContent("Clear all");
        expect(row).toHaveAttribute("aria-selected", "true");
        await user.click(row);
        expect(onChange).toHaveBeenCalledWith([]);
      });

      it("honours custom select-all / clear-all labels", async () => {
        const user = userEvent.setup();
        render(
          <Dropdown
            multi
            showSelectAll
            deselectAllLabel="Zrušit všechny položky"
            onChange={vi.fn()}
            options={OPTIONS}
            selectAllLabel="Vybrat všechny položky"
            value={["cs"]}
          />,
        );
        await user.click(screen.getByTestId(DropdownTestId.Trigger));
        expect(screen.getByTestId(DropdownTestId.SelectAll)).toHaveTextContent(
          "Vybrat všechny položky",
        );
      });

      it("toggles all via the keyboard from the leading row", async () => {
        const onChange = vi.fn();
        const user = userEvent.setup();
        render(<Dropdown multi showSelectAll onChange={onChange} options={OPTIONS} value={[]} />);
        const trigger = screen.getByTestId(DropdownTestId.Trigger);
        trigger.focus();
        await user.keyboard("{ArrowDown}"); // open, active = select-all row (index 0)
        expect(trigger).toHaveAttribute(
          "aria-activedescendant",
          screen.getByTestId(DropdownTestId.SelectAll).id,
        );
        await user.keyboard("{Enter}");
        expect(onChange).toHaveBeenCalledWith(["cs", "en"]);
      });
    });

    describe("compact", () => {
      const MANY = [
        { value: "a", label: "Alpha" },
        { value: "b", label: "Bravo" },
        { value: "c", label: "Charlie" },
        { value: "d", label: "Delta" },
      ];

      // The overflow algorithm measures real DOM widths (getBoundingClientRect/
      // clientWidth), which jsdom always reports as 0 — so tests stub both to
      // simulate a concrete layout: every chip candidate is 80px, the overflow
      // chip is 60px, and the visible row is `rowWidth` px wide.
      const mockLayout = (rowWidth: number) => {
        vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
          this: HTMLElement,
        ) {
          const width = (this.textContent ?? "").startsWith("+") ? 60 : 80;
          return {
            width,
            height: 24,
            top: 0,
            left: 0,
            right: width,
            bottom: 24,
            x: 0,
            y: 0,
            toJSON: () => {},
          } as DOMRect;
        });
        vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(rowWidth);
      };

      it("keeps the trigger to a single row via nowrap classes", () => {
        render(<Dropdown compact multi onChange={vi.fn()} options={OPTIONS} value={["cs"]} />);
        const row = screen.getByTestId(DropdownTestId.ChipsRow);
        expect(row.className).toContain("flex-nowrap");
        expect(row.className).not.toContain("flex-wrap");
      });

      it("shows every chip with no overflow marker when they all fit", () => {
        mockLayout(1000);
        render(
          <Dropdown compact multi onChange={vi.fn()} options={MANY} value={["a", "b", "c", "d"]} />,
        );
        expect(screen.getByTestId(`${DropdownTestId.Chip}-a`)).toBeInTheDocument();
        expect(screen.getByTestId(`${DropdownTestId.Chip}-b`)).toBeInTheDocument();
        expect(screen.getByTestId(`${DropdownTestId.Chip}-c`)).toBeInTheDocument();
        expect(screen.getByTestId(`${DropdownTestId.Chip}-d`)).toBeInTheDocument();
        expect(screen.queryByTestId(DropdownTestId.Overflow)).not.toBeInTheDocument();
      });

      it("collapses chips that don't fit into a trailing +N chip", () => {
        // 80px chips + 6px gap + reserved 60px overflow chip: room for exactly two.
        mockLayout(300);
        render(
          <Dropdown compact multi onChange={vi.fn()} options={MANY} value={["a", "b", "c", "d"]} />,
        );
        expect(screen.getByTestId(`${DropdownTestId.Chip}-a`)).toBeInTheDocument();
        expect(screen.getByTestId(`${DropdownTestId.Chip}-b`)).toBeInTheDocument();
        expect(screen.queryByTestId(`${DropdownTestId.Chip}-c`)).not.toBeInTheDocument();
        expect(screen.queryByTestId(`${DropdownTestId.Chip}-d`)).not.toBeInTheDocument();
        expect(screen.getByTestId(DropdownTestId.Overflow)).toHaveTextContent("+2");
      });

      it("always shows at least one chip even when it alone doesn't fit", () => {
        mockLayout(10);
        render(
          <Dropdown compact multi onChange={vi.fn()} options={MANY} value={["a", "b", "c", "d"]} />,
        );
        expect(screen.getByTestId(`${DropdownTestId.Chip}-a`)).toBeInTheDocument();
        expect(screen.getByTestId(DropdownTestId.Overflow)).toHaveTextContent("+3");
      });
    });
  });
});
