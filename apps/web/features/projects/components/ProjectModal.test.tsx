import type { Project } from "@zibby/contracts";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders as render, screen } from "../../../test/render";
import userEvent from "@testing-library/user-event";
import { ProjectModal } from "./ProjectModal";

const project = (over: Partial<Project> = {}): Project => ({
  id: "alpha",
  name: "Alpha",
  path: "~/Projects/alpha",
  ...over,
});

describe("ProjectModal env + secrets", () => {
  it("saves env key/value pairs onto the project entity", async () => {
    const onSave = vi.fn();
    render(
      <ProjectModal
        categories={[]}
        isNew={false}
        onClose={vi.fn()}
        onDelete={vi.fn()}
        onDeleteSecrets={vi.fn()}
        onSave={onSave}
        onSetSecrets={vi.fn()}
        project={project()}
      />,
    );

    await userEvent.click(screen.getByTestId("project-env-add"));
    await userEvent.type(screen.getByTestId("project-env-key-0"), "NODE_ENV");
    await userEvent.type(screen.getByTestId("project-env-value-0"), "production");
    await userEvent.click(screen.getByRole("button", { name: /uložit změny/i }));

    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.calls[0]![0] as Project;
    expect(saved.env).toEqual({ NODE_ENV: "production" });
  });

  it("sends write-only secrets through onSetSecrets and never on the entity", async () => {
    const onSetSecrets = vi.fn();
    render(
      <ProjectModal
        categories={[]}
        isNew={false}
        onClose={vi.fn()}
        onDelete={vi.fn()}
        onDeleteSecrets={vi.fn()}
        onSave={vi.fn()}
        onSetSecrets={onSetSecrets}
        project={project()}
      />,
    );

    await userEvent.click(screen.getByTestId("project-secret-add"));
    await userEvent.type(screen.getByTestId("project-secret-key-0"), "OPENAI_API_KEY");
    await userEvent.type(screen.getByTestId("project-secret-value-0"), "sk-secret");
    await userEvent.click(screen.getByTestId("project-secrets-save"));

    expect(onSetSecrets).toHaveBeenCalledTimes(1);
    expect(onSetSecrets.mock.calls[0]![0]).toBe("alpha");
    expect(onSetSecrets.mock.calls[0]![1]).toEqual({ OPENAI_API_KEY: "sk-secret" });
  });

  it("saves verify checks as one command per line onto the project entity", async () => {
    const onSave = vi.fn();
    render(
      <ProjectModal
        categories={[]}
        isNew={false}
        onClose={vi.fn()}
        onDelete={vi.fn()}
        onDeleteSecrets={vi.fn()}
        onSave={onSave}
        onSetSecrets={vi.fn()}
        project={project()}
      />,
    );

    await userEvent.type(screen.getByTestId("project-checks"), "pnpm lint{enter}pnpm test");
    await userEvent.click(screen.getByRole("button", { name: /uložit změny/i }));

    const saved = onSave.mock.calls[0]![0] as Project;
    expect(saved.checks).toEqual(["pnpm lint", "pnpm test"]);
  });

  it("seeds the checks editor from the existing project and clears to undefined when emptied", async () => {
    const onSave = vi.fn();
    render(
      <ProjectModal
        categories={[]}
        isNew={false}
        onClose={vi.fn()}
        onDelete={vi.fn()}
        onDeleteSecrets={vi.fn()}
        onSave={onSave}
        onSetSecrets={vi.fn()}
        project={project({ checks: ["pnpm build"] })}
      />,
    );

    expect(screen.getByTestId("project-checks")).toHaveValue("pnpm build");
    await userEvent.clear(screen.getByTestId("project-checks"));
    await userEvent.click(screen.getByRole("button", { name: /uložit změny/i }));

    const saved = onSave.mock.calls[0]![0] as Project;
    expect(saved.checks).toBeUndefined();
  });

  it("hides the secrets section for a brand-new (unsaved) project", () => {
    render(
      <ProjectModal
        isNew
        categories={[]}
        onClose={vi.fn()}
        onDelete={vi.fn()}
        onDeleteSecrets={vi.fn()}
        onSave={vi.fn()}
        onSetSecrets={vi.fn()}
        project={project({ id: "", name: "" })}
      />,
    );
    expect(screen.queryByTestId("project-secret-add")).toBeNull();
  });
});
