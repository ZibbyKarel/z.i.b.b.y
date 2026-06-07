import { render, screen } from "@testing-library/react"
import { zodResolver } from "../zodResolver"
import { z } from "zod"
import { describe, expect, it, vi } from "vitest"
import { DropZoneTestId, FieldTestId } from "@zibby/design-system"
import { Form } from "../Form"
import { FormDropZone } from "./FormDropZone"
import userEvent from "@testing-library/user-event"

const schema = z.object({ files: z.array(z.instanceof(File)).min(1, "Nahrajte alespoň jeden soubor") })
type Schema = z.infer<typeof schema>

describe("FormDropZone", () => {
  it("renders the drop zone", () => {
    render(
      <Form<Schema>
        formOptions={{ defaultValues: { files: [] } }}
        onSubmit={vi.fn()}
      >
        <FormDropZone<Schema> label="Přílohy" name="files" />
      </Form>,
    )
    expect(screen.getByTestId(DropZoneTestId.Root)).toBeInTheDocument()
  })

  it("shows zod error as error text on submit when no files dropped", async () => {
    render(
      <Form<Schema>
        formOptions={{ resolver: zodResolver(schema), defaultValues: { files: [] } }}
        onSubmit={vi.fn()}
      >
        <FormDropZone<Schema> label="Přílohy" name="files" />
        <button type="submit">Submit</button>
      </Form>,
    )
    await userEvent.click(screen.getByRole("button", { name: "Submit" }))
    expect(screen.getByTestId(FieldTestId.Error)).toHaveTextContent("Nahrajte alespoň jeden soubor")
  })

  it("passes through hint when there is no error", () => {
    render(
      <Form<Schema>
        formOptions={{ defaultValues: { files: [] } }}
        onSubmit={vi.fn()}
      >
        <FormDropZone<Schema> hint="PDF nebo obrázky" label="Přílohy" name="files" />
      </Form>,
    )
    expect(screen.getByTestId(FieldTestId.Hint)).toHaveTextContent("PDF nebo obrázky")
  })
})
