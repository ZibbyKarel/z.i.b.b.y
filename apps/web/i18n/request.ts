import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";

const SUPPORTED = ["cs", "en"] as const;
type Locale = (typeof SUPPORTED)[number];

function isSupported(v: string | undefined): v is Locale {
  return SUPPORTED.includes(v as Locale);
}

export default getRequestConfig(async () => {
  const store = await cookies();
  const raw = store.get("locale")?.value;
  const locale: Locale = isSupported(raw) ? raw : "cs";

  return {
    locale,
    messages: (await import(`./messages/${locale}.json`)).default,
  };
});
