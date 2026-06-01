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
];
