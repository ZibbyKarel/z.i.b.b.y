import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { DesignSystemProvider } from "../../DesignSystemContext/DesignSystemProvider";
import { Tabs, TabList, Tab, TabPanel } from "./Tabs";

function wrap(ui: React.ReactNode) {
  return render(<DesignSystemProvider theme="dark">{ui}</DesignSystemProvider>);
}

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

describe("Tabs", () => {
  it("renders tabs and shows the default panel", () => {
    wrap(<BasicTabs />);
    expect(screen.getByRole("tab", { name: "Přehled" })).toBeInTheDocument();
    expect(screen.getByText("Obsah A")).toBeInTheDocument();
    expect(screen.queryByText("Obsah B")).toBeNull();
  });

  it("switches to the clicked tab's panel", async () => {
    wrap(<BasicTabs />);
    await userEvent.click(screen.getByRole("tab", { name: "Detail" }));
    expect(screen.getByText("Obsah B")).toBeInTheDocument();
    expect(screen.queryByText("Obsah A")).toBeNull();
  });

  it("marks the active tab as selected", () => {
    wrap(<BasicTabs />);
    expect(screen.getByRole("tab", { name: "Přehled" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Detail" })).toHaveAttribute("aria-selected", "false");
  });

  it("renders a tabpanel", () => {
    wrap(<BasicTabs />);
    expect(screen.getByRole("tabpanel")).toBeInTheDocument();
  });
});
