// This file has been automatically migrated to valid ESM format by Storybook.
import { fileURLToPath } from 'node:url';
import type { StorybookConfig } from '@storybook/tanstack-react';
import { resolve, dirname } from 'path';
import remarkGfm from 'remark-gfm';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const config: StorybookConfig = {
  stories: ['../src/**/*.mdx', '../src/**/*.stories.@(js|jsx|mjs|ts|tsx)'],
  addons: [
    '@chromatic-com/storybook',
    {
      // Storybook's MDX pipeline is CommonMark only. Without remark-gfm a
      // GFM table renders as one reflowed paragraph of literal pipes — which
      // is what the elevation level table did, silently, because it is the
      // only MDX table in the project (#225).
      name: '@storybook/addon-docs',
      options: {
        mdxPluginOptions: {
          mdxCompileOptions: { remarkPlugins: [remarkGfm] },
        },
      },
    },
    '@storybook/addon-onboarding',
    '@storybook/addon-a11y',
    '@storybook/addon-vitest',
    '@storybook/addon-mcp',
  ],
  framework: {
    name: '@storybook/tanstack-react',
    options: {},
  },
  viteFinal: async config => {
    if (config.resolve) {
      config.resolve.alias = {
        ...config.resolve.alias,
        '@': resolve(__dirname, '../src'),
        '@components': resolve(__dirname, '../src/components'),
        '@routes': resolve(__dirname, '../src/routes'),
        '@store': resolve(__dirname, '../src/store'),
        '@lib': resolve(__dirname, '../src/lib'),
        '@styles': resolve(__dirname, '../src/styles'),
        '@i18n': resolve(__dirname, '../src/i18n'),
        '@hooks': resolve(__dirname, '../src/hooks'),
        '@types': resolve(__dirname, '../src/types'),
      };
    }
    return config;
  },
};
export default config;
