import type { Meta, StoryObj } from "@storybook/react";
import { Container } from "@zibby/design-system";
import { EntityFormModal, type FieldSchema } from "./EntityFormModal";

const skillFields: FieldSchema[] = [
  {
    name: "name",
    label: "Název skillu",
    kind: "text",
    placeholder: "např. rohlik",
    required: true,
  },
  {
    name: "desc",
    label: "Popis",
    kind: "textarea",
    hint: "uloží se jako description v SKILL.md",
  },
  {
    name: "ctx",
    label: "Kontext",
    kind: "segmented",
    defaultValue: "home",
    options: [
      { value: "home", label: "home" },
      { value: "work", label: "work" },
    ],
  },
];

const meta: Meta<typeof EntityFormModal> = {
  title: "Dashboard/EntityFormModal",
  component: EntityFormModal,
  parameters: { backgrounds: { default: "velin" }, layout: "fullscreen" },
  decorators: [
    (Story) => (
      <Container position="relative" height="100vh">
        <Story />
      </Container>
    ),
  ],
  args: {
    title: "Nový skill",
    subtitle: "vytvoří SKILL.md na disku",
    glyph: "spark",
    fields: skillFields,
    submitLabel: "Vytvořit skill",
    filePreview: (v) => `~/zibby/skills/${v.name || "<název>"}/SKILL.md`,
    onClose: () => {},
    onSubmit: () => {},
  },
};
export default meta;

type Story = StoryObj<typeof EntityFormModal>;

export const Skill: Story = {};
