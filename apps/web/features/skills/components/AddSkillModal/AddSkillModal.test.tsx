import { renderWithProviders as render, screen, waitFor } from "../../../../test/render";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AddSkillModal } from "./AddSkillModal";

/**
 * The modal is CREATE-ONLY (N4d grammar: dialogs create and confirm, nothing
 * else) — editing lives on the /skills/:id detail page. This pins the create
 * title, the absence of edit/delete vocabulary, and the emitted submit shape.
 */
describe("AddSkillModal — create-only", () => {
  it("shows the create title and no edit/delete vocabulary", () => {
    render(<AddSkillModal categories={["ops"]} onClose={vi.fn()} onSubmit={vi.fn()} />);
    expect(screen.getByText("Nový skill")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Smazat" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Uložit" })).toBeNull();
  });

  it("emits a create submit with the typed name and the picked glyph", async () => {
    const onSubmit = vi.fn();
    render(<AddSkillModal categories={[]} onClose={vi.fn()} onSubmit={onSubmit} />);

    await userEvent.type(screen.getByRole("textbox", { name: /název/i }), "Deploy");
    await userEvent.click(screen.getByRole("button", { name: "Vytvořit skill" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const values = onSubmit.mock.calls[0]![0];
    expect(values.name).toBe("Deploy");
    expect(values.glyph).toBe("spark");
  });
});
