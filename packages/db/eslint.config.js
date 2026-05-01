import baseConfig from '@bgcf/config/eslint-base';

export default [
  ...baseConfig,
  {
    ignores: ['dist/**', 'node_modules/**', '.turbo/**', 'drizzle/**'],
  },
];
