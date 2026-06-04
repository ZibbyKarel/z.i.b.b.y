import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { zodResolver } from "../zodResolver"
import { z } from "zod"
import { describe, expect, it, vi } from "vitest"
import { FieldTestId, SegmentPickerTestId } from "@zibby/design-system"
import { Form } from "../Form"
import { FormSegmentPicker } from "./FormSegmentPicker"

const options = [
  { value: "day", label: "Den" },
  { value: "week", label: "Týden" },
  { value: "month", label: "Měsíc" },
]
const schema = z.object({ period: z.string().min(1, "Vyberte období") })
type Schema = z.infer<typeof schema>

describe("FormSegmentPicker", () => {
  it("shows zod error as error text on submit when no option chosen", async () => {
    render(
      <Form<Schema>
        formOptions={{ resolver: zodResolver(schema), defaultValues: { period: "" } }}
        onSubmit={vi.fn()}
      >
        <FormSegmentPicker<Schema> label="Období" name="period" options={options} />
        <button type="submit">Submit</button>
      </Form>,
    )
    await userEvent.click(screen.getByRole("button", { name: "Submit" }))
    expect(screen.getByTestId(FieldTestId.Error)).toHaveTextContent("Vyberte období")
  })

  it("updates the value when a segment is chosen", async () => {
    const onSubmit = vi.fn()
    render(
      <Form<Schema>
        formOptions={{ resolver: zodResolver(schema), defaultValues: { period: "" } }}
        onSubmit={onSubmit}
      >
        <FormSegmentPicker<Schema> label="Období" name="period" options={options} />
        <button type="submit">Submit</button>
      </Form>,
    )
    await userEvent.click(screen.getByTestId(`${SegmentPickerTestId.Option}-week`))
    await userEvent.click(screen.getByRole("button", { name: "Submit" }))
    expect(onSubmit).toHaveBeenCalledWith({ period: "week" }, expect.anything())
  })

  it("uses defaultValues from Form to pre-select a segment", () => {
    render(
      <Form<{ period: string }>
        formOptions={{ defaultValues: { period: "month" } }}
        onSubmit={vi.fn()}
      >
        <FormSegmentPicker<{ period: string }> label="Období" name="period" options={options} />
      </Form>,
    )
    expect(screen.getByTestId(`${SegmentPickerTestId.Option}-month`)).toHaveAttribute(
      "aria-checked",
      "true",
    )
  })

  it("passes through hint when there is no error", () => {
    render(
      <Form<{ period: string }>
        formOptions={{ defaultValues: { period: "" } }}
        onSubmit={vi.fn()}
      >
        <FormSegmentPicker<{ period: string }>
          hint="Helper text"
          label="Období"
          name="period"
          options={options}
        />
      </Form>,
    )
    expect(screen.getByTestId(FieldTestId.Hint)).toHaveTextContent("Helper text")
  })
})
