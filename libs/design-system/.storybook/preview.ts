import type { Preview } from "@storybook/react"
import "../src/theme/globals.css"

const preview: Preview = {
  parameters: {
    layout: "centered",
    backgrounds: {
      default: "velin",
      values: [{ name: "velin", value: "#0d1117" }],
    },
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
  },
}

export default preview
