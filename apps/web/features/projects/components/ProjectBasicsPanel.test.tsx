import { fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DropdownTestId, IconTileTestId } from "@zibby/design-system";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders as render, screen } from "../../../test/render";
import { toastBus } from "../../../components/Toaster/toastBus";
import { ProjectBasicsPanel } from "./ProjectBasicsPanel";

describe("ProjectBasicsPanel logo upload", () => {
  it("shows the glyph fallback when no logo is set", () => {
    render(<ProjectBasicsPanel isNew categories={[]} onSave={vi.fn()} />);
    expect(screen.queryByTestId(IconTileTestId.Image)).not.toBeInTheDocument();
  });

  it("previews a valid image and clears it via Remove", async () => {
    render(<ProjectBasicsPanel isNew categories={[]} onSave={vi.fn()} />);
    const input = screen.getByTestId("project-logo-input");
    const file = new File(["fake-bytes"], "logo.png", { type: "image/png" });
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    fireEvent.change(input);

    const img = await screen.findByTestId(IconTileTestId.Image);
    expect(img.getAttribute("src")).toMatch(/^data:image\/png;base64,/);

    await userEvent.click(screen.getByText("Odebrat logo"));
    expect(screen.queryByTestId(IconTileTestId.Image)).not.toBeInTheDocument();
  });

  it("includes the uploaded logo in the saved body", async () => {
    const onSave = vi.fn();
    render(<ProjectBasicsPanel isNew categories={[]} onSave={onSave} />);
    const input = screen.getByTestId("project-logo-input");
    const file = new File(["fake-bytes"], "logo.png", { type: "image/png" });
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    fireEvent.change(input);
    await screen.findByTestId(IconTileTestId.Image);

    await userEvent.type(screen.getByPlaceholderText("media-vault"), "Alpha");
    await userEvent.click(screen.getByTestId("save-basics"));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ logo: expect.stringMatching(/^data:image\/png;base64,/) }),
    );
  });

  it("rejects a non-image file with a toast and keeps the glyph", async () => {
    const emitSpy = vi.spyOn(toastBus, "emit");
    render(<ProjectBasicsPanel isNew categories={[]} onSave={vi.fn()} />);
    const input = screen.getByTestId("project-logo-input");
    const file = new File(["not an image"], "doc.pdf", { type: "application/pdf" });
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    fireEvent.change(input);

    expect(emitSpy).toHaveBeenCalled();
    expect(screen.queryByTestId(IconTileTestId.Image)).not.toBeInTheDocument();
  });

  it("rejects an oversized image with a toast and keeps the glyph", async () => {
    const emitSpy = vi.spyOn(toastBus, "emit");
    render(<ProjectBasicsPanel isNew categories={[]} onSave={vi.fn()} />);
    const input = screen.getByTestId("project-logo-input");
    // Comfortably over the ~200 KB / 280 000-base64-char cap once encoded.
    const bytes = new Uint8Array(215_000);
    const file = new File([bytes], "big.png", { type: "image/png" });
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    fireEvent.change(input);

    await waitFor(() => expect(emitSpy).toHaveBeenCalled());
    expect(screen.queryByTestId(IconTileTestId.Image)).not.toBeInTheDocument();
  });
});

describe("ProjectBasicsPanel dollar caps (Phase 12)", () => {
  it("saves the three dollar caps entered alongside the run caps", async () => {
    const onSave = vi.fn();
    render(<ProjectBasicsPanel isNew categories={[]} onSave={onSave} />);

    await userEvent.type(screen.getByPlaceholderText("media-vault"), "Alpha");
    await userEvent.type(screen.getByLabelText("$ / den"), "5");
    await userEvent.type(screen.getByLabelText("$ / týden"), "20");
    await userEvent.type(screen.getByLabelText("$ / měsíc"), "80");
    await userEvent.click(screen.getByTestId("save-basics"));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        budget: expect.objectContaining({
          dailyCostCapUsd: 5,
          weeklyCostCapUsd: 20,
          monthlyCostCapUsd: 80,
        }),
      }),
    );
  });

  it("prefills the dollar-cap fields from the existing project", () => {
    render(
      <ProjectBasicsPanel
        categories={[]}
        isNew={false}
        onSave={vi.fn()}
        project={{
          id: "alpha",
          name: "Alpha",
          path: "~/Projects/alpha",
          budget: { dailyCostCapUsd: 5 },
        }}
      />,
    );
    expect(screen.getByLabelText("$ / den")).toHaveValue("5");
    expect(screen.getByLabelText("$ / týden")).toHaveValue("");
  });

  it("omits budget entirely when every run- and dollar-cap field is blank", async () => {
    const onSave = vi.fn();
    render(<ProjectBasicsPanel isNew categories={[]} onSave={onSave} />);

    await userEvent.type(screen.getByPlaceholderText("media-vault"), "Alpha");
    await userEvent.click(screen.getByTestId("save-basics"));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ budget: undefined }));
  });
});

describe("ProjectBasicsPanel category selector (Phase 98)", () => {
  const categories = [
    { name: "Dev", glyph: "code" },
    { name: "Ops", glyph: "code" },
  ];

  it("renders no selector when there are no categories", () => {
    render(<ProjectBasicsPanel isNew categories={[]} onSave={vi.fn()} />);
    expect(screen.queryByTestId(DropdownTestId.Trigger)).not.toBeInTheDocument();
  });

  it("offers a 'no category' option alongside every category", async () => {
    const user = userEvent.setup();
    render(<ProjectBasicsPanel isNew categories={categories} onSave={vi.fn()} />);

    await user.click(screen.getByTestId(DropdownTestId.Trigger));
    const labels = screen.getAllByTestId(DropdownTestId.Option).map((o) => o.textContent);
    expect(labels).toEqual(["Bez kategorie", "Dev", "Ops"]);
  });

  it("saves the picked category name", async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(<ProjectBasicsPanel isNew categories={categories} onSave={onSave} />);

    await user.click(screen.getByTestId(DropdownTestId.Trigger));
    const opsOption = screen.getAllByTestId(DropdownTestId.Option).find((o) => o.textContent === "Ops");
    await user.click(opsOption!);

    await userEvent.type(screen.getByPlaceholderText("media-vault"), "Alpha");
    await userEvent.click(screen.getByTestId("save-basics"));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ category: "Ops" }));
  });

  it("saves undefined when 'no category' is picked", async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(
      <ProjectBasicsPanel
        categories={categories}
        isNew={false}
        onSave={onSave}
        project={{ id: "alpha", name: "Alpha", category: "Dev" }}
      />,
    );

    await user.click(screen.getByTestId(DropdownTestId.Trigger));
    const noneOption = screen
      .getAllByTestId(DropdownTestId.Option)
      .find((o) => o.textContent === "Bez kategorie");
    await user.click(noneOption!);
    await userEvent.click(screen.getByTestId("save-basics"));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ category: undefined }));
  });
});

describe("ProjectBasicsPanel gitRemote field (Phase 77)", () => {
  it("seeds the field from the existing project", () => {
    render(
      <ProjectBasicsPanel
        categories={[]}
        isNew={false}
        onSave={vi.fn()}
        project={{
          id: "alpha",
          name: "Alpha",
          path: "~/Projects/alpha",
          gitRemote: "git@github.com:acme/alpha.git",
        }}
      />,
    );
    expect(screen.getByDisplayValue("git@github.com:acme/alpha.git")).toBeInTheDocument();
  });

  it("starts empty for a new project and submits undefined when left blank", async () => {
    const onSave = vi.fn();
    render(<ProjectBasicsPanel isNew categories={[]} onSave={onSave} />);

    await userEvent.type(screen.getByPlaceholderText("media-vault"), "Alpha");
    await userEvent.click(screen.getByTestId("save-basics"));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ gitRemote: undefined }));
  });

  it("includes the trimmed gitRemote in the saved body", async () => {
    const onSave = vi.fn();
    render(<ProjectBasicsPanel isNew categories={[]} onSave={onSave} />);

    await userEvent.type(screen.getByPlaceholderText("media-vault"), "Alpha");
    await userEvent.type(
      screen.getByPlaceholderText("git@github.com:org/repo.git"),
      "  git@github.com:acme/alpha.git  ",
    );
    await userEvent.click(screen.getByTestId("save-basics"));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ gitRemote: "git@github.com:acme/alpha.git" }),
    );
  });
});
