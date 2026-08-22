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
      'src/components/ui',
      'node_modules',
      'src/prototypes', // throwaway prototype code — see mattpocock-skills:prototype
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
  storybook.configs['flat/recommended']
);
