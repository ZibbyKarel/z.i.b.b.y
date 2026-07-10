import coreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import reactPlugin from "eslint-plugin-react";

export default [
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/dist/**",
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
    // inline styles on DOM elements. Genuinely dynamic / SVG values that have no
    // DS prop use a per-line `// eslint-disable-next-line react/forbid-dom-props`
    // escape. The design system itself is exempt (it owns the styling layer).
    files: ["apps/web/**/*.{ts,tsx}"],
    ignores: ["apps/web/**/*.stories.{ts,tsx}"],
    plugins: { react: reactPlugin },
    rules: {
      "react/forbid-dom-props": ["error", { forbid: ["style"] }],
    },
  },
];
