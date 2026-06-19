import { describe, expect, it, vi } from "vitest";
import { renderWithProviders as render, screen } from "../../../../test/render";
import { type AddSkillInitial, AddSkillModal } from "./AddSkillModal";

const initial: AddSkillInitial = {
  name: "Deploy",
  desc: "Ship the app",
  category: "ops",
  glyph: "spark",
  instructions: "# Deploy\nrun the pipeline",
};

describe("AddSkillModal — edit mode", () => {
  it("pre-fills the form and shows the edit title", () => {
    render(
      <AddSkillModal
        categories={["ops"]}
        initial={initial}
        onClose={vi.fn()}
        onDelete={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.getByDisplayValue("Deploy")).toBeInTheDocument();
    expect(screen.getByText("Upravit skill")).toBeInTheDocument();
  });

  it("deletes via the Delete button", () => {
    const onDelete = vi.fn();
    render(
      <AddSkillModal
        categories={["ops"]}
        initial={initial}
        onClose={vi.fn()}
        onDelete={onDelete}
        onSubmit={vi.fn()}
      />,
    );
    screen.getByRole("button", { name: "Smazat" }).click();
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("create mode shows no Delete button", () => {
    render(<AddSkillModal categories={[]} onClose={vi.fn()} onSubmit={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Smazat" })).toBeNull();
  });
});
