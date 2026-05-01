import nextConfig from '@bgcf/config/eslint-next';

const config = [
  ...nextConfig,
  {
    ignores: ['.next/**', 'node_modules/**', '.turbo/**', 'next-env.d.ts'],
  },
];

export default config;
