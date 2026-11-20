import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // .mjs as well as .js: study-docs-pdf.test.mjs was silently never collected
    // while only .test.js was listed, so it could rot without anyone noticing.
    include: ['tests/**/*.test.js', 'tests/**/*.test.mjs'],
    testTimeout: 30000,
    hookTimeout: 120000
  }
});
