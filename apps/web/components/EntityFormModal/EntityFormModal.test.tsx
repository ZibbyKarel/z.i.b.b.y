import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders as render, screen } from "../../test/render";
import { EntityFormModal, type FieldSchema } from "./EntityFormModal";

const fields: FieldSchema[] = [
  { name: "name", label: "Název skillu", kind: "text", required: true },
  { name: "desc", label: "Popis", kind: "textarea" },
];

describe("EntityFormModal", () => {
  it("renders all fields and a live file preview", () => {
    render(
      <EntityFormModal
        fields={fields}
        filePreview={(v) => `~/zibby/skills/${v.name || "<název>"}/SKILL.md`}
        glyph="spark"
        onClose={() => {}}
        onSubmit={() => {}}
        submitLabel="Vytvořit skill"
        title="Nový skill"
      />,
    );
    expect(screen.getByLabelText("Název skillu")).toBeInTheDocument();
    expect(screen.getByLabelText("Popis")).toBeInTheDocument();
    expect(screen.getByText("~/zibby/skills/<název>/SKILL.md")).toBeInTheDocument();
  });

  it("keeps submit disabled until required fields are filled, then submits values", async () => {
    const onSubmit = vi.fn();
    render(
      <EntityFormModal
        fields={fields}
        glyph="spark"
        onClose={() => {}}
        onSubmit={onSubmit}
        submitLabel="Vytvořit skill"
        title="Nový skill"
      />,
    );
    const submit = screen.getByRole("button", { name: /Vytvořit skill/ });
    expect(submit).toBeDisabled();

    await userEvent.type(screen.getByLabelText("Název skillu"), "rohlik");
    expect(submit).toBeEnabled();

    await userEvent.click(submit);
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ name: "rohlik" }));
  });

  it("cancels", async () => {
    const onClose = vi.fn();
    render(
      <EntityFormModal
        fields={fields}
        glyph="spark"
        onClose={onClose}
        onSubmit={() => {}}
        submitLabel="Vytvořit"
        title="Nový skill"
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Zrušit" }));
    expect(onClose).toHaveBeenCalled();
  });
});
