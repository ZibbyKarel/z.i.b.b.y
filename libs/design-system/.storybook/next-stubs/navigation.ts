/**
 * Storybook stub for `next/navigation`. Mirrors the component-test mocks so app
 * client components that read the router/pathname render under the react-vite
 * builder. The active route resolves to /overview.
 */
export const useRouter = () => ({
  push() {},
  replace() {},
  refresh() {},
  prefetch() {},
  back() {},
  forward() {},
});

export const usePathname = () => "/overview";

export const useSearchParams = () => new URLSearchParams();

export const redirect = () => {};

export const notFound = () => {};
