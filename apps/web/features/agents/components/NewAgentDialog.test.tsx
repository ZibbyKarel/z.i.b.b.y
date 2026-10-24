import { DropdownTestId, MarkdownEditorTestId } from "@zibby/design-system";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, renderWithProviders as render, screen, waitFor } from "../../../test/render";
import { NewAgentDialog } from "./NewAgentDialog";

vi.mock("../../departments/useDepartmentLookup", () => ({
  useDepartmentLookup: () => ({
    list: [
      { id: "dev", name: "Vývoj", code: "DEV" },
      { id: "qa", name: "Kvalita", code: "QA" },
    ],
    get: () => undefined,
  }),
}));

function open() {
  const onCreate = vi.fn();
  render(
    <NewAgentDialog
      categories={[{ name: "dev", glyph: "bot" }]}
      onClose={vi.fn()}
      onCreate={onCreate}
    />,
  );
  const name = screen.getByPlaceholderText("jméno agenta");
  return { onCreate, name };
}

const createButton = () => screen.getByRole("button", { name: "Vytvořit agenta" });

function fillRequired(name: HTMLElement) {
  fireEvent.change(name, { target: { value: "Writer" } });
  const body = screen.getByTestId(MarkdownEditorTestId.Control);
  fireEvent.change(body, { target: { value: "Write clearly." } });
}

describe("NewAgentDialog — department", () => {
  it("keeps Submit disabled until a department is chosen", async () => {
    const { name } = open();
    fillRequired(name);
    await waitFor(() => expect(createButton()).toBeDisabled());
  });

  it("sends the chosen department in the onCreate payload", async () => {
    const { onCreate, name } = open();
    fillRequired(name);
    const trigger = screen.getByLabelText("Vlastnící oddělení");
    fireEvent.click(trigger);
    const option = screen
      .getAllByTestId(DropdownTestId.Option)
      .find((o) => o.textContent?.includes("Kvalita"));
    fireEvent.click(option!);
    await waitFor(() => expect(createButton()).toBeEnabled());
    fireEvent.click(createButton());
    await waitFor(() => expect(onCreate).toHaveBeenCalled());
    expect(onCreate.mock.calls[0]?.[0]).toMatchObject({ department: "qa" });
  });
});
