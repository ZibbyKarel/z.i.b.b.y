import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { zodResolver } from "../zodResolver"
import { z } from "zod"
import { describe, expect, it, vi } from "vitest"
import { FieldTestId, TextInputTestId } from "@zibby/design-system"
import { Form } from "../Form"
import { FormTextInput } from "./FormTextInput"

const schema = z.object({ name: z.string().min(1, "Povinné pole") })
type Schema = z.infer<typeof schema>

describe("FormTextInput", () => {
  it("shows zod error as error text and sets aria-invalid on submit", async () => {
    render(
      <Form<Schema>
        formOptions={{ resolver: zodResolver(schema), defaultValues: { name: "" } }}
        onSubmit={vi.fn()}
      >
        <FormTextInput<Schema> label="Název" name="name" />
        <button type="submit">Submit</button>
      </Form>,
    )
    await userEvent.click(screen.getByRole("button", { name: "Submit" }))
    expect(screen.getByTestId(FieldTestId.Error)).toHaveTextContent("Povinné pole")
    expect(screen.getByTestId(TextInputTestId.Control)).toHaveAttribute("aria-invalid", "true")
  })

  it("clears error after valid input", async () => {
    render(
      <Form<Schema>
        formOptions={{ resolver: zodResolver(schema), defaultValues: { name: "" }, mode: "onChange" }}
        onSubmit={vi.fn()}
      >
        <FormTextInput<Schema> label="Název" name="name" />
        <button type="submit">Submit</button>
      </Form>,
    )
    await userEvent.click(screen.getByRole("button", { name: "Submit" }))
    expect(screen.getByTestId(FieldTestId.Error)).toBeInTheDocument()
    await userEvent.type(screen.getByTestId(TextInputTestId.Control), "hello")
    expect(screen.queryByTestId(FieldTestId.Error)).not.toBeInTheDocument()
  })

  it("uses defaultValues from Form to pre-fill the input", () => {
    render(
      <Form<{ name: string }>
        formOptions={{ defaultValues: { name: "initial" } }}
        onSubmit={vi.fn()}
      >
        <FormTextInput<{ name: string }> label="Název" name="name" />
      </Form>,
    )
    expect(screen.getByTestId(TextInputTestId.Control)).toHaveValue("initial")
  })

  it("forwards data-testid to the input element", () => {
    render(
      <Form<{ name: string }>
        formOptions={{ defaultValues: { name: "" } }}
        onSubmit={vi.fn()}
      >
        <FormTextInput<{ name: string }> data-testid="my-input" label="Název" name="name" />
      </Form>,
    )
    expect(screen.getByTestId("my-input")).toBeInTheDocument()
  })

  it("passes through hint when there is no error", () => {
    render(
      <Form<{ name: string }>
        formOptions={{ defaultValues: { name: "" } }}
        onSubmit={vi.fn()}
      >
        <FormTextInput<{ name: string }> hint="Helper text" label="Název" name="name" />
      </Form>,
    )
    expect(screen.getByTestId(FieldTestId.Hint)).toHaveTextContent("Helper text")
  })
})
