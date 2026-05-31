import { useState } from "react"
import type { Meta, StoryObj } from "@storybook/react"
import { SegmentedField, SelectField, TextAreaField, TextField } from "./Field"

const meta: Meta = {
  title: "Components/Field",
  parameters: { backgrounds: { default: "velin" } },
  decorators: [(Story) => <div className="w-96"><Story /></div>],
}
export default meta

type Story = StoryObj

export const AllFields: Story = {
  render: () => {
    const [name, setName] = useState("rohlik")
    const [desc, setDesc] = useState("")
    const [model, setModel] = useState("opus")
    const [ctx, setCtx] = useState("home")
    return (
      <div className="flex flex-col gap-4">
        <TextField label="Název skillu" value={name} onChange={(e) => setName(e.target.value)} />
        <TextAreaField
          label="Popis"
          hint="z description v SKILL.md"
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
        />
        <SelectField
          label="Model"
          value={model}
          onValueChange={setModel}
          options={[
            { value: "opus", label: "opus" },
            { value: "sonnet", label: "sonnet" },
            { value: "haiku", label: "haiku" },
          ]}
        />
        <SegmentedField
          label="Kontext"
          value={ctx}
          onValueChange={setCtx}
          options={[
            { value: "home", label: "home" },
            { value: "work", label: "work" },
          ]}
        />
      </div>
    )
  },
}
