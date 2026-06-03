import type { Preview } from "@storybook/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { DesignSystemProvider } from "../src/DesignSystemContext/DesignSystemProvider";
import { contextTokens } from "./contextTokens";
import messages from "../../../apps/web/i18n/messages/cs.json";
import "../src/theme/globals.css";

// App stories pull in next-intl translations and React Query. A single shared
// client is fine for Storybook — nothing here mutates the cache across stories.
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

const preview: Preview = {
  globalTypes: {
    theme: {
      description: "Design system theme",
      defaultValue: "dark",
      toolbar: {
        title: "Theme",
        icon: "moon",
        items: [
          { value: "dark", title: "Dark" },
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
          { value: "work", title: "Work (blue)" },
        ],
        dynamicTitle: true,
      },
    },
  },
  decorators: [
    (Story, ctx) => (
      <DesignSystemProvider
        style={{
          minHeight: "200px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
        }}
        theme={(ctx.globals["theme"] as "dark" | "light") ?? "dark"}
        tokens={contextTokens(
          (ctx.globals["context"] as "home" | "work") ?? "home",
        )}
      >
        <NextIntlClientProvider locale="cs" messages={messages}>
          <QueryClientProvider client={queryClient}>
            <Story />
          </QueryClientProvider>
        </NextIntlClientProvider>
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
