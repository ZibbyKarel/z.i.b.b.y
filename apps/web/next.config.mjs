/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The design system is consumed as TypeScript source, so let Next transpile it.
  transpilePackages: ["@zibby/design-system"],
}

export default nextConfig
