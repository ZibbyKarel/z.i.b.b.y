import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { zodResolver } from "../zodResolver"
import { z } from "zod"
import { describe, expect, it, vi } from "vitest"
import { DropdownTestId, FieldTestId } from "@zibby/design-system"
import { Form } from "../Form"
import { FormSelect } from "./FormSelect"

const options = [
  { value: "a", label: "Option A" },
  { value: "b", label: "Option B" },
]
const schema = z.object({ choice: z.string().min(1, "Vyberte možnost") })
type Schema = z.infer<typeof schema>

describe("FormSelect", () => {
  it("shows zod error as error text on submit when no option chosen", async () => {
    render(
      <Form<Schema>
        formOptions={{ resolver: zodResolver(schema), defaultValues: { choice: "" } }}
        onSubmit={vi.fn()}
      >
        <FormSelect<string, Schema> label="Výběr" name="choice" options={options} />
        <button type="submit">Submit</button>
      </Form>,
    )
    await userEvent.click(screen.getByRole("button", { name: "Submit" }))
    expect(screen.getByTestId(FieldTestId.Error)).toHaveTextContent("Vyberte možnost")
  })

  it("updates the value when an option is selected", async () => {
    const onSubmit = vi.fn()
    render(
      <Form<Schema>
        formOptions={{ resolver: zodResolver(schema), defaultValues: { choice: "" } }}
        onSubmit={onSubmit}
      >
        <FormSelect<string, Schema> label="Výběr" name="choice" options={options} />
        <button type="submit">Submit</button>
      </Form>,
    )
    await userEvent.click(screen.getByTestId(DropdownTestId.Trigger))
    await userEvent.click(screen.getByText("Option A"))
    await userEvent.click(screen.getByRole("button", { name: "Submit" }))
    expect(onSubmit).toHaveBeenCalledWith({ choice: "a" }, expect.anything())
  })

  it("uses defaultValues from Form to pre-select an option", () => {
    render(
      <Form<{ choice: string }>
        formOptions={{ defaultValues: { choice: "b" } }}
        onSubmit={vi.fn()}
      >
        <FormSelect<string, { choice: string }> label="Výběr" name="choice" options={options} />
      </Form>,
    )
    expect(screen.getByTestId(DropdownTestId.Trigger)).toHaveTextContent("Option B")
  })

  it("passes through hint when there is no error", () => {
    render(
      <Form<{ choice: string }>
        formOptions={{ defaultValues: { choice: "" } }}
        onSubmit={vi.fn()}
      >
        <FormSelect<string, { choice: string }>
          hint="Helper text"
          label="Výběr"
          name="choice"
          options={options}
        />
      </Form>,
    )
    expect(screen.getByTestId(FieldTestId.Hint)).toHaveTextContent("Helper text")
  })
})
