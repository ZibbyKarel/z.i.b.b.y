declare module "*.css";

import type en from "./i18n/messages/en.json";

declare module "next-intl" {
  interface AppConfig {
    Locale: "cs" | "en";
    Messages: typeof en;
  }
}
