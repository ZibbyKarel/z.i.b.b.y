import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { zodResolver } from "../zodResolver"
import { z } from "zod"
import { describe, expect, it, vi } from "vitest"
import { FieldTestId, FilePickerFieldTestId } from "@zibby/design-system"
import { Form } from "../Form"
import { FormFilePicker } from "./FormFilePicker"

const schema = z.object({ files: z.array(z.instanceof(File)).min(1, "Soubor je povinný") })
type Schema = z.infer<typeof schema>

describe("FormFilePicker", () => {
  it("shows zod error as error text on submit when no file selected", async () => {
    render(
      <Form<Schema>
        formOptions={{ resolver: zodResolver(schema), defaultValues: { files: [] } }}
        onSubmit={vi.fn()}
      >
        <FormFilePicker<Schema> label="Dokument" name="files" />
        <button type="submit">Submit</button>
      </Form>,
    )
    await userEvent.click(screen.getByRole("button", { name: "Submit" }))
    expect(screen.getByTestId(FieldTestId.Error)).toHaveTextContent("Soubor je povinný")
  })

  it("calls field.onChange with File[] when a file is selected", () => {
    const onSubmit = vi.fn()
    render(
      <Form<{ files: File[] }>
        formOptions={{ defaultValues: { files: [] } }}
        onSubmit={onSubmit}
      >
        <FormFilePicker<{ files: File[] }> label="Dokument" name="files" />
        <button type="submit">Submit</button>
      </Form>,
    )
    const input = screen.getByTestId(FilePickerFieldTestId.Input)
    const file = new File([""], "report.pdf", { type: "application/pdf" })
    Object.defineProperty(input, "files", { value: [file], configurable: true })
    fireEvent.change(input)

    expect(screen.getByTestId(FilePickerFieldTestId.Display)).toHaveTextContent("report.pdf")
  })

  it("passes through hint when there is no error", () => {
    render(
      <Form<{ files: File[] }>
        formOptions={{ defaultValues: { files: [] } }}
        onSubmit={vi.fn()}
      >
        <FormFilePicker<{ files: File[] }> hint="PDF nebo DOCX" label="Dokument" name="files" />
      </Form>,
    )
    expect(screen.getByTestId(FieldTestId.Hint)).toHaveTextContent("PDF nebo DOCX")
  })

  it("clears error after valid file selected", async () => {
    render(
      <Form<Schema>
        formOptions={{ resolver: zodResolver(schema), defaultValues: { files: [] }, mode: "onChange" }}
        onSubmit={vi.fn()}
      >
        <FormFilePicker<Schema> label="Dokument" name="files" />
        <button type="submit">Submit</button>
      </Form>,
    )
    await userEvent.click(screen.getByRole("button", { name: "Submit" }))
    expect(screen.getByTestId(FieldTestId.Error)).toBeInTheDocument()

    const input = screen.getByTestId(FilePickerFieldTestId.Input)
    Object.defineProperty(input, "files", {
      value: [new File([""], "doc.pdf")],
      configurable: true,
    })
    fireEvent.change(input)

    await waitFor(() => {
      expect(screen.queryByTestId(FieldTestId.Error)).not.toBeInTheDocument()
    })
  })
})
