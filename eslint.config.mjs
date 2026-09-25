import coreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import reactPlugin from "eslint-plugin-react";

export default [
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/dist/**",
      "apps/desktop/resources/**",
      "apps/desktop/release/**",
      "**/storybook-static/**",
      "graphify-out/**",
      "design-ref/**",
      "design/**",
      "**/next-env.d.ts",
      "**/*.config.{js,mjs,ts,mts}",
    ],
  },
  ...coreWebVitals,
  ...nextTypescript,
  {
    settings: {
      next: {
        rootDir: "apps/web",
      },
    },
  },
  {
    plugins: { react: reactPlugin },
    rules: {
      "sort-imports": [
        "error",
        {
          ignoreCase: false,
          ignoreDeclarationSort: true,
          ignoreMemberSort: false,
          allowSeparatedGroups: true,
        },
      ],
      "react/jsx-sort-props": [
        "error",
        {
          shorthandFirst: true,
          callbacksLast: false,
          ignoreCase: false,
          noSortAlphabetically: false,
        },
      ],
    },
  },
  {
    files: ["**/*.stories.{ts,tsx}"],
    rules: {
      "react-hooks/rules-of-hooks": "off",
    },
  },
  {
    // react-hook-form's useController derives field.name / field.value / field.onChange /
    // field.onBlur from a useRef-backed _registerProps object. eslint-plugin-react-hooks v7
    // (React Compiler rules) flags those accesses as "ref values used during render".
    // The pattern is intentional in RHF (synchronous mutation before render) and cannot
    // be changed without forking the library.
    files: ["libs/forms/src/**/*.{ts,tsx}"],
    rules: {
      "react-hooks/refs": "off",
    },
  },
  {
    // apps/web composes UI exclusively from the design system — it never sets
    // inline styles or Tailwind classes on DOM elements (D-007). Genuinely dynamic
    // / SVG values that have no DS prop use a per-line
    // `// eslint-disable-next-line react/forbid-dom-props` escape for `style`.
    // There is no per-line escape for `className` — the DS is exempt (it owns the
    // styling layer) and stories are exempt.
    files: ["apps/web/**/*.{ts,tsx}"],
    ignores: ["apps/web/**/*.stories.{ts,tsx}"],
    plugins: { react: reactPlugin },
    rules: {
      "react/forbid-dom-props": ["error", { forbid: ["style", "className"] }],
      "no-restricted-syntax": [
        "error",
        {
          selector: "JSXAttribute[name.name='className']",
          message: "apps/web composes from DS — no className (D-007)",
        },
      ],
      "no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "clsx", message: "apps/web composes from DS — no clsx (D-007)" },
            {
              name: "tailwind-merge",
              message: "apps/web composes from DS — no tailwind-merge (D-007)",
            },
            {
              name: "class-variance-authority",
              message: "apps/web composes from DS — no class-variance-authority (D-007)",
            },
          ],
          patterns: [
            {
              // Every other *.css import is an ad hoc app stylesheet — banned.
              // `./globals.css` (the app's one entry point, itself just
              // re-exporting the DS global stylesheet) is the sanctioned
              // exception, imported once in `app/layout.tsx`.
              group: ["*.css", "!./globals.css", "!@zibby/design-system/*.css"],
              message: "apps/web composes from DS — no ad hoc stylesheets (D-007)",
            },
          ],
        },
      ],
    },
  },
];
