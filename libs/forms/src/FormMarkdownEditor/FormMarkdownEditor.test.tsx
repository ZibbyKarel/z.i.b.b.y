import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Form } from "../Form";
import { FormMarkdownEditor } from "./FormMarkdownEditor";

// @uiw/react-md-editor uses browser APIs not available in jsdom. Stub it out
// so we can test the RHF wiring without fighting the third-party renderer.
vi.mock("@zibby/design-system", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@zibby/design-system")>();
  return {
    ...mod,
    MarkdownEditor: ({
      value,
      onChange,
      hint,
    }: {
      value: string;
      onChange: (v: string) => void;
      hint?: string;
    }) => (
      <div>
        <textarea
          data-testid="md-control"
          onChange={(e) => onChange(e.target.value)}
          value={value}
        />
        {hint && <span data-testid="md-hint">{hint}</span>}
      </div>
    ),
  };
});

describe("FormMarkdownEditor", () => {
  it("wires value and onChange to the RHF controller", async () => {
    const onSubmit = vi.fn();
    render(
      <Form<{ body: string }> formOptions={{ defaultValues: { body: "" } }} onSubmit={onSubmit}>
        <FormMarkdownEditor<{ body: string }> label="Obsah" name="body" />
        <button type="submit">Submit</button>
      </Form>,
    );
    await userEvent.type(screen.getByTestId("md-control"), "hello");
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect(onSubmit).toHaveBeenCalledWith({ body: "hello" }, expect.anything());
  });

  it("uses defaultValues from Form to pre-fill the editor", () => {
    render(
      <Form<{ body: string }>
        formOptions={{ defaultValues: { body: "initial markdown" } }}
        onSubmit={vi.fn()}
      >
        <FormMarkdownEditor<{ body: string }> label="Obsah" name="body" />
      </Form>,
    );
    expect(screen.getByTestId("md-control")).toHaveValue("initial markdown");
  });

  it("passes through hint to the editor", () => {
    render(
      <Form<{ body: string }> formOptions={{ defaultValues: { body: "" } }} onSubmit={vi.fn()}>
        <FormMarkdownEditor<{ body: string }> hint="Helper text" label="Obsah" name="body" />
      </Form>,
    );
    expect(screen.getByTestId("md-hint")).toHaveTextContent("Helper text");
  });
});
