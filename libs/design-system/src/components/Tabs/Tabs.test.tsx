import { screen } from "@testing-library/react";
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
