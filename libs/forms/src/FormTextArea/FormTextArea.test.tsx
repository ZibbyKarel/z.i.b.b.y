import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { zodResolver } from "../zodResolver";
import { z } from "zod";
import { describe, expect, it, vi } from "vitest";
import { FieldTestId, TextAreaFieldTestId } from "@zibby/design-system";
import { Form } from "../Form";
import { FormTextArea } from "./FormTextArea";

const schema = z.object({ body: z.string().min(1, "Povinné pole") });
type Schema = z.infer<typeof schema>;

describe("FormTextArea", () => {
  it("shows zod error as error text and sets aria-invalid on submit", async () => {
    render(
      <Form<Schema>
        formOptions={{ resolver: zodResolver(schema), defaultValues: { body: "" } }}
        onSubmit={vi.fn()}
      >
        <FormTextArea<Schema> label="Popis" name="body" />
        <button type="submit">Submit</button>
      </Form>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect(screen.getByTestId(FieldTestId.Error)).toHaveTextContent("Povinné pole");
    expect(screen.getByTestId(TextAreaFieldTestId.Control)).toHaveAttribute("aria-invalid", "true");
  });

  it("uses defaultValues from Form to pre-fill the textarea", () => {
    render(
      <Form<{ body: string }>
        formOptions={{ defaultValues: { body: "initial text" } }}
        onSubmit={vi.fn()}
      >
        <FormTextArea<{ body: string }> label="Popis" name="body" />
      </Form>,
    );
    expect(screen.getByTestId(TextAreaFieldTestId.Control)).toHaveValue("initial text");
  });

  it("forwards data-testid to the textarea element", () => {
    render(
      <Form<{ body: string }> formOptions={{ defaultValues: { body: "" } }} onSubmit={vi.fn()}>
        <FormTextArea<{ body: string }> data-testid="my-textarea" label="Popis" name="body" />
      </Form>,
    );
    expect(screen.getByTestId("my-textarea")).toBeInTheDocument();
  });

  it("passes through hint when there is no error", () => {
    render(
      <Form<{ body: string }> formOptions={{ defaultValues: { body: "" } }} onSubmit={vi.fn()}>
        <FormTextArea<{ body: string }> hint="Helper text" label="Popis" name="body" />
      </Form>,
    );
    expect(screen.getByTestId(FieldTestId.Hint)).toHaveTextContent("Helper text");
  });
});
