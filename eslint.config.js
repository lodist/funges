// For more info, see https://github.com/storybookjs/eslint-plugin-storybook#configuration-flat-config-format
import storybook from 'eslint-plugin-storybook';

import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import react from 'eslint-plugin-react';
import prettier from 'eslint-plugin-prettier';
import tseslint from 'typescript-eslint';
import i18next from 'eslint-plugin-i18next';
import unusedImports from 'eslint-plugin-unused-imports';

export default tseslint.config(
  {
    ignores: [
      'dist',
      'dev-dist',
      'storybook-static', // build artifact; linting it fails on vendored bundles
      'node_modules',
      'src/prototypes', // throwaway prototype code — see mattpocock-skills:prototype
      '.claude', // local agent worktrees/state, not part of the repo
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    plugins: {
      react: react,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      prettier: prettier,
      i18next,
      'unused-imports': unusedImports,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      // React rules
      'react/jsx-uses-react': 'off',
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      'react/jsx-key': 'error',
      'react/jsx-no-duplicate-props': 'error',
      'react/jsx-no-undef': 'error',
      'react/no-array-index-key': 'warn',
      'react/no-unescaped-entities': 'warn',
      // Prettier integration
      'prettier/prettier': 'error',
      // Disable conflicting rules
      'arrow-body-style': 'off',
      'prefer-arrow-callback': 'off',
      // Unused imports and variables
      '@typescript-eslint/no-unused-vars': 'off', // Turn off as unused-imports handles this better
      'no-unused-vars': 'off', // Turn off base rule as it conflicts with TypeScript rule
      // Unused imports plugin rules
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'warn',
        {
          vars: 'all',
          varsIgnorePattern: '^_',
          args: 'after-used',
          argsIgnorePattern: '^_',
        },
      ],
      // Import rules
      'import/no-unused-modules': 'off', // This rule can be too strict
      'i18next/no-literal-string': [
        'error',
        {
          markupOnly: true, // Only warn inside JSX (not in code, logs, etc.)
          ignoreAttribute: [
            'id',
            'key',
            'data-testid',
            'to',
            'href',
            'src',
            'alt',
            // add any other JSX attributes where string is allowed
          ],
        },
      ],
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
  },
  {
    // The shadcn primitives pair a context provider with the hook that reads
    // it, so the hook has to be exported from the same module as the
    // component. Naming the two exports keeps Fast Refresh's warning useful
    // everywhere else in the directory instead of ignoring the rule wholesale.
    files: ['src/components/ui/**/*.tsx'],
    rules: {
      'react-refresh/only-export-components': [
        'warn',
        {
          allowConstantExport: true,
          allowExportNames: ['useFormField', 'useSidebar'],
        },
      ],
    },
  },
  {
    // Icons go through src/lib/icons.tsx, which decides decorative-vs-named
    // once instead of at every call site. Lucide itself sets no ARIA at all, so
    // importing it directly is how the 109th icon would silently ship with no
    // accessible name and no aria-hidden.
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/lib/icons.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'lucide-react',
              message:
                "Import icons from '@/lib/icons' — it applies the aria-hidden / role='img' contract.",
            },
          ],
          patterns: ['lucide-react/*'],
        },
      ],
    },
  },
  storybook.configs['flat/recommended']
);
