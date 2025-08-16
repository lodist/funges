import type { StorybookConfig } from '@storybook/react-vite';
import { resolve } from 'path';

const config: StorybookConfig = {
  stories: ['../src/**/*.mdx', '../src/**/*.stories.@(js|jsx|mjs|ts|tsx)'],
  addons: [
    '@chromatic-com/storybook',
    '@storybook/addon-docs',
    '@storybook/addon-onboarding',
    '@storybook/addon-a11y',
    '@storybook/addon-vitest',
  ],
  framework: {
    name: '@storybook/react-vite',
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
