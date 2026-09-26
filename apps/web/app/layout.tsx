import "./globals.css";

import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeScript, htmlFontAttrs } from "@zibby/design-system";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { Providers } from "./providers";
import { PropsWithChildren } from "react";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

// DS.md §3 — "Never use 700 or above": 400 (body), 500 (titles, names), 600 (mono
// emphasis, wordmark).
const geistMono = Geist_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ZibbyCorp",
  description: "ZibbyCorp — Zestful Intuitive Brainy Butler for You.",
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
};

export default async function RootLayout({ children }: PropsWithChildren) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html
      suppressHydrationWarning
      {...htmlFontAttrs(geist.variable, geistMono.variable)}
      lang={locale}
    >
      <head>
        {/* Sets <html data-theme> before hydration — see ThemeScript's doc comment
         * and DesignSystemProvider (providers.tsx) for the post-hydration half.
         * `fallback="light"` (ZB-01/O-01/D-014) matches `Providers`' own
         * `theme="system"` default now that light — not dark — is the app's
         * default theme. */}
        <ThemeScript fallback="light" />
      </head>
      <body>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
