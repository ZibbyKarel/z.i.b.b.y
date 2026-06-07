import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { zodResolver } from "../zodResolver"
import { z } from "zod"
import { describe, expect, it, vi } from "vitest"
import { FieldTestId, ToggleFieldTestId } from "@zibby/design-system"
import { Form } from "../Form"
import { FormToggle } from "./FormToggle"

const schema = z.object({ enabled: z.boolean().refine((v) => v, "Musíte souhlasit") })
type Schema = z.infer<typeof schema>

describe("FormToggle", () => {
  it("shows zod error as error text on submit when unchecked", async () => {
    render(
      <Form<Schema>
        formOptions={{ resolver: zodResolver(schema), defaultValues: { enabled: false } }}
        onSubmit={vi.fn()}
      >
        <FormToggle<Schema> label="Souhlasím" name="enabled" />
        <button type="submit">Submit</button>
      </Form>,
    )
    await userEvent.click(screen.getByRole("button", { name: "Submit" }))
    expect(screen.getByTestId(FieldTestId.Error)).toHaveTextContent("Musíte souhlasit")
  })

  it("toggles value on click and submits", async () => {
    const onSubmit = vi.fn()
    render(
      <Form<{ enabled: boolean }>
        formOptions={{ defaultValues: { enabled: false } }}
        onSubmit={onSubmit}
      >
        <FormToggle<{ enabled: boolean }> label="Souhlasím" name="enabled" />
        <button type="submit">Submit</button>
      </Form>,
    )
    await userEvent.click(screen.getByTestId(ToggleFieldTestId.Control))
    await userEvent.click(screen.getByRole("button", { name: "Submit" }))
    expect(onSubmit).toHaveBeenCalledWith({ enabled: true }, expect.anything())
  })

  it("uses defaultValues from Form to set initial checked state", () => {
    render(
      <Form<{ enabled: boolean }>
        formOptions={{ defaultValues: { enabled: true } }}
        onSubmit={vi.fn()}
      >
        <FormToggle<{ enabled: boolean }> label="Souhlasím" name="enabled" />
      </Form>,
    )
    expect(screen.getByTestId(ToggleFieldTestId.Control)).toHaveAttribute("aria-checked", "true")
  })

  it("passes through hint when there is no error", () => {
    render(
      <Form<{ enabled: boolean }>
        formOptions={{ defaultValues: { enabled: false } }}
        onSubmit={vi.fn()}
      >
        <FormToggle<{ enabled: boolean }> hint="Helper text" label="Souhlasím" name="enabled" />
      </Form>,
    )
    expect(screen.getByTestId(FieldTestId.Hint)).toHaveTextContent("Helper text")
  })
})
