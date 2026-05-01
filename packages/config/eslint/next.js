import { FlatCompat } from '@eslint/eslintrc';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import baseConfig from './base.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

/** ESLint flat config for Next.js apps — extends the base + Next/React rules. */
export default [...baseConfig, ...compat.extends('next/core-web-vitals', 'next/typescript')];
