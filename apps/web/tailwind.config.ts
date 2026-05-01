import type { Config } from 'tailwindcss';

export default {
  content: [
    './app/**/*.{ts,tsx,mdx}',
    './components/**/*.{ts,tsx}',
    './server/**/*.{ts,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
} satisfies Config;
