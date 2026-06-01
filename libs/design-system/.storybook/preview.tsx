import type { Preview } from "@storybook/react";
import { DesignSystemProvider } from "../src/DesignSystemContext/DesignSystemProvider";
import { contextTokens } from "../src/DesignSystemContext/contextTokens";
import "../src/theme/globals.css";

const preview: Preview = {
  globalTypes: {
    theme: {
      description: "Design system theme",
      defaultValue: "dark",
      toolbar: {
        title: "Theme",
        icon: "moon",
        items: [
          { value: "dark",  title: "Dark"  },
          { value: "light", title: "Light" },
        ],
        dynamicTitle: true,
      },
    },
    context: {
      description: "Dashboard context accent",
      defaultValue: "home",
      toolbar: {
        title: "Context",
        icon: "lightning",
        items: [
          { value: "home", title: "Home (amber)" },
          { value: "work", title: "Work (blue)"  },
        ],
        dynamicTitle: true,
      },
    },
  },
  decorators: [
    (Story, ctx) => (
      <DesignSystemProvider
        theme={(ctx.globals["theme"] as "dark" | "light") ?? "dark"}
        tokens={contextTokens((ctx.globals["context"] as "home" | "work") ?? "home")}
        style={{
          minHeight: "200px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
        }}
      >
        <Story />
      </DesignSystemProvider>
    ),
  ],
  parameters: {
    layout: "fullscreen",
    backgrounds: { disable: true },
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
  },
};

export default preview;
