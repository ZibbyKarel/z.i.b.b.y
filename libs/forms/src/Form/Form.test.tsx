import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { zodResolver } from "../zodResolver"
import { z } from "zod"
import { describe, expect, it, vi } from "vitest"
import { TextInputTestId } from "@zibby/design-system"
import { FormTextInput } from "../FormTextInput"
import { Form, useFormControls } from "./Form"

const schema = z.object({ name: z.string().min(1, "Povinné pole") })
type Schema = z.infer<typeof schema>

describe("Form", () => {
  it("calls onSubmit with validated values", async () => {
    const onSubmit = vi.fn()
    render(
      <Form<Schema>
        formOptions={{ resolver: zodResolver(schema), defaultValues: { name: "" } }}
        onSubmit={onSubmit}
      >
        <FormTextInput<Schema> label="Název" name="name" />
        <button type="submit">Odeslat</button>
      </Form>,
    )
    await userEvent.type(screen.getByTestId(TextInputTestId.Control), "hello")
    await userEvent.click(screen.getByRole("button", { name: "Odeslat" }))
    expect(onSubmit).toHaveBeenCalledWith({ name: "hello" }, expect.anything())
  })

  it("blocks submit when validation fails", async () => {
    const onSubmit = vi.fn()
    render(
      <Form<Schema>
        formOptions={{ resolver: zodResolver(schema), defaultValues: { name: "" } }}
        onSubmit={onSubmit}
      >
        <FormTextInput<Schema> label="Název" name="name" />
        <button type="submit">Odeslat</button>
      </Form>,
    )
    await userEvent.click(screen.getByRole("button", { name: "Odeslat" }))
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it("passes native form attributes to the form element", () => {
    render(
      <Form<Schema>
        aria-label="test form"
        formOptions={{ defaultValues: { name: "" } }}
        onSubmit={vi.fn()}
      >
        <FormTextInput<Schema> label="Název" name="name" />
      </Form>,
    )
    expect(screen.getByRole("form", { name: "test form" })).toBeInTheDocument()
  })
})

describe("useFormControls", () => {
  it("renderForm mounts children in a form element", () => {
    function TestHarness() {
      const { renderForm } = useFormControls<Schema>({
        resolver: zodResolver(schema),
        defaultValues: { name: "" },
        onSubmit: vi.fn(),
      })
      return renderForm(
        <>
          <FormTextInput<Schema> label="Název" name="name" />
          <button type="submit">Odeslat</button>
        </>,
      )
    }
    render(<TestHarness />)
    expect(screen.getByTestId(TextInputTestId.Control)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Odeslat" })).toBeInTheDocument()
  })
})
