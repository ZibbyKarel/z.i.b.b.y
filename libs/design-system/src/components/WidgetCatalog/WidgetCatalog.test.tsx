import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { render } from "../../utils/testRender";
import { WidgetCatalog, WidgetCatalogTestId } from "./WidgetCatalog";

const base = { title: "WIDGET CATALOG", addLabel: "ADD", closeLabel: "Close", emptyText: "Empty" };

describe("WidgetCatalog", () => {
  it("lists entries and reports add/close", async () => {
    const onAdd = vi.fn();
    const onClose = vi.fn();
    render(
      <WidgetCatalog
        {...base}
        entries={[{ id: "prs", label: "PULL REQUESTS", description: "Agent PRs" }]}
        onAdd={onAdd}
        onClose={onClose}
      />,
    );
    expect(screen.getByTestId(`${WidgetCatalogTestId.Entry}-prs`)).toHaveTextContent("Agent PRs");
    await userEvent.click(screen.getByTestId(`${WidgetCatalogTestId.Add}-prs`));
    expect(onAdd).toHaveBeenCalledWith("prs");
    await userEvent.click(screen.getByTestId(WidgetCatalogTestId.Close));
    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.queryByTestId(WidgetCatalogTestId.Empty)).toBeNull();
  });

  it("shows the empty text when nothing is left to add", () => {
    render(<WidgetCatalog {...base} entries={[]} onAdd={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByTestId(WidgetCatalogTestId.Empty)).toHaveTextContent("Empty");
  });
});
