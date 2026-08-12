import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { render } from "../../utils/testRender";
import { Tab, TabList, TabPanel, Tabs, TabsTestId } from "./Tabs";

function BasicTabs() {
  return (
    <Tabs defaultValue="a">
      <TabList>
        <Tab value="a">Přehled</Tab>
        <Tab value="b">Detail</Tab>
      </TabList>
      <TabPanel value="a">Obsah A</TabPanel>
      <TabPanel value="b">Obsah B</TabPanel>
    </Tabs>
  );
}

function ThreeTabs() {
  return (
    <Tabs defaultValue="a">
      <TabList>
        <Tab value="a">Přehled</Tab>
        <Tab value="b">Detail</Tab>
        <Tab value="c">Historie</Tab>
      </TabList>
      <TabPanel value="a">Obsah A</TabPanel>
      <TabPanel value="b">Obsah B</TabPanel>
      <TabPanel value="c">Obsah C</TabPanel>
    </Tabs>
  );
}

function VerticalTabs() {
  return (
    <Tabs defaultValue="a" direction="vertical">
      <TabList>
        <Tab value="a">Sekce A</Tab>
        <Tab value="b">Sekce B</Tab>
      </TabList>
      <TabPanel value="a">Obsah A</TabPanel>
      <TabPanel value="b">Obsah B</TabPanel>
    </Tabs>
  );
}

describe("Tabs", () => {
  it("renders tabs and shows the default panel", () => {
    render(<BasicTabs />);
    expect(screen.getByTestId(`${TabsTestId.Tab}-a`)).toHaveAccessibleName("Přehled");
    expect(screen.getByTestId(`${TabsTestId.Panel}-a`)).toHaveTextContent("Obsah A");
    expect(screen.queryByTestId(`${TabsTestId.Panel}-b`)).toBeNull();
  });

  it("switches to the clicked tab's panel", async () => {
    render(<BasicTabs />);
    await userEvent.click(screen.getByTestId(`${TabsTestId.Tab}-b`));
    expect(screen.getByTestId(`${TabsTestId.Panel}-b`)).toHaveTextContent("Obsah B");
    expect(screen.queryByTestId(`${TabsTestId.Panel}-a`)).toBeNull();
  });

  it("marks the active tab as selected", () => {
    render(<BasicTabs />);
    expect(screen.getByTestId(`${TabsTestId.Tab}-a`)).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId(`${TabsTestId.Tab}-b`)).toHaveAttribute("aria-selected", "false");
  });

  it("renders a tabpanel", () => {
    render(<BasicTabs />);
    expect(screen.getByTestId(`${TabsTestId.Panel}-a`)).toHaveRole("tabpanel");
  });

  it("roving tabindex: only the active tab is a tab stop", () => {
    render(<BasicTabs />);
    expect(screen.getByTestId(`${TabsTestId.Tab}-a`)).toHaveAttribute("tabindex", "0");
    expect(screen.getByTestId(`${TabsTestId.Tab}-b`)).toHaveAttribute("tabindex", "-1");
  });

  describe("keyboard navigation (horizontal)", () => {
    it("ArrowRight moves focus to and selects the next tab", () => {
      render(<ThreeTabs />);
      const tabA = screen.getByTestId(`${TabsTestId.Tab}-a`);
      tabA.focus();
      fireEvent.keyDown(tabA, { key: "ArrowRight" });
      const tabB = screen.getByTestId(`${TabsTestId.Tab}-b`);
      expect(tabB).toHaveFocus();
      expect(tabB).toHaveAttribute("aria-selected", "true");
      expect(screen.getByTestId(`${TabsTestId.Panel}-b`)).toHaveTextContent("Obsah B");
    });

    it("ArrowRight wraps from the last tab to the first", () => {
      render(<ThreeTabs />);
      const tabC = screen.getByTestId(`${TabsTestId.Tab}-c`);
      tabC.focus();
      fireEvent.keyDown(tabC, { key: "ArrowRight" });
      const tabA = screen.getByTestId(`${TabsTestId.Tab}-a`);
      expect(tabA).toHaveFocus();
      expect(tabA).toHaveAttribute("aria-selected", "true");
    });

    it("ArrowLeft moves focus to and selects the previous tab, wrapping at the start", () => {
      render(<ThreeTabs />);
      const tabA = screen.getByTestId(`${TabsTestId.Tab}-a`);
      tabA.focus();
      fireEvent.keyDown(tabA, { key: "ArrowLeft" });
      const tabC = screen.getByTestId(`${TabsTestId.Tab}-c`);
      expect(tabC).toHaveFocus();
      expect(tabC).toHaveAttribute("aria-selected", "true");
    });

    it("End moves focus to and selects the last tab", () => {
      render(<ThreeTabs />);
      const tabA = screen.getByTestId(`${TabsTestId.Tab}-a`);
      tabA.focus();
      fireEvent.keyDown(tabA, { key: "End" });
      const tabC = screen.getByTestId(`${TabsTestId.Tab}-c`);
      expect(tabC).toHaveFocus();
      expect(tabC).toHaveAttribute("aria-selected", "true");
    });

    it("Home moves focus to and selects the first tab", () => {
      render(<ThreeTabs />);
      const tabC = screen.getByTestId(`${TabsTestId.Tab}-c`);
      tabC.focus();
      fireEvent.keyDown(tabC, { key: "Home" });
      const tabA = screen.getByTestId(`${TabsTestId.Tab}-a`);
      expect(tabA).toHaveFocus();
      expect(tabA).toHaveAttribute("aria-selected", "true");
    });

    it("ArrowUp/ArrowDown are no-ops in a horizontal tablist", () => {
      render(<ThreeTabs />);
      const tabA = screen.getByTestId(`${TabsTestId.Tab}-a`);
      tabA.focus();
      fireEvent.keyDown(tabA, { key: "ArrowDown" });
      expect(tabA).toHaveFocus();
      expect(tabA).toHaveAttribute("aria-selected", "true");
    });
  });

  describe("direction=vertical", () => {
    it("renders default panel", () => {
      render(<VerticalTabs />);
      expect(screen.getByTestId(`${TabsTestId.Panel}-a`)).toHaveTextContent("Obsah A");
      expect(screen.queryByTestId(`${TabsTestId.Panel}-b`)).toBeNull();
    });

    it("switches panel on click", async () => {
      render(<VerticalTabs />);
      await userEvent.click(screen.getByTestId(`${TabsTestId.Tab}-b`));
      expect(screen.getByTestId(`${TabsTestId.Panel}-b`)).toHaveTextContent("Obsah B");
      expect(screen.queryByTestId(`${TabsTestId.Panel}-a`)).toBeNull();
    });

    it("marks the active tab as selected", () => {
      render(<VerticalTabs />);
      expect(screen.getByTestId(`${TabsTestId.Tab}-a`)).toHaveAttribute("aria-selected", "true");
      expect(screen.getByTestId(`${TabsTestId.Tab}-b`)).toHaveAttribute("aria-selected", "false");
    });

    it("ArrowDown moves focus to and selects the next tab", () => {
      render(<VerticalTabs />);
      const tabA = screen.getByTestId(`${TabsTestId.Tab}-a`);
      tabA.focus();
      fireEvent.keyDown(tabA, { key: "ArrowDown" });
      const tabB = screen.getByTestId(`${TabsTestId.Tab}-b`);
      expect(tabB).toHaveFocus();
      expect(tabB).toHaveAttribute("aria-selected", "true");
      expect(screen.getByTestId(`${TabsTestId.Panel}-b`)).toHaveTextContent("Obsah B");
    });

    it("ArrowUp moves focus to and selects the previous tab, wrapping at the start", () => {
      render(<VerticalTabs />);
      const tabA = screen.getByTestId(`${TabsTestId.Tab}-a`);
      tabA.focus();
      fireEvent.keyDown(tabA, { key: "ArrowUp" });
      const tabB = screen.getByTestId(`${TabsTestId.Tab}-b`);
      expect(tabB).toHaveFocus();
      expect(tabB).toHaveAttribute("aria-selected", "true");
    });

    it("ArrowLeft/ArrowRight are no-ops in a vertical tablist", () => {
      render(<VerticalTabs />);
      const tabA = screen.getByTestId(`${TabsTestId.Tab}-a`);
      tabA.focus();
      fireEvent.keyDown(tabA, { key: "ArrowRight" });
      expect(tabA).toHaveFocus();
      expect(tabA).toHaveAttribute("aria-selected", "true");
    });

    it("supports ReactNode children as tab labels", () => {
      render(
        <Tabs defaultValue="x" direction="vertical">
          <TabList>
            <Tab value="x">
              <span>Ikona</span> Label
            </Tab>
          </TabList>
          <TabPanel value="x">Panel X</TabPanel>
        </Tabs>,
      );
      expect(screen.getByTestId(`${TabsTestId.Tab}-x`)).toHaveTextContent("Ikona Label");
    });
  });
});
