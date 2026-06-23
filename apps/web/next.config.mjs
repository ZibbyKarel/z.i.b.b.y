import createNextIntlPlugin from "next-intl/plugin";

// Path is relative to cwd. next-intl's Turbopack integration resolves it against
// process.cwd() (and rejects absolute paths), so `web:dev` runs from apps/web — see
// the script in the root package.json. Webpack (build/start) resolves it against the
// project dir, so those keep running from the repo root unchanged.
const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@zibby/design-system"],
};

export default withNextIntl(nextConfig);
