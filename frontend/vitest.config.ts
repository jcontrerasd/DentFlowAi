import path from 'node:path';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

/** Tests que abren conexión real a PostgreSQL; excluidos salvo RUN_DB_INTEGRATION_TESTS=true */
const dbIntegrationTestGlobs =
  process.env.RUN_DB_INTEGRATION_TESTS === 'true'
    ? []
    : [
        '**/test/env-check.test.ts',
        '**/test/full-app-workflow.test.ts',
        '**/test/simulation-flow.test.ts',
        '**/test/fauchard-config-versioning.test.ts',
      ];

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    css: false,
    /** BD compartida: evitar carreras entre full-app-workflow, simulation-flow, etc. */
    ...(process.env.RUN_DB_INTEGRATION_TESTS === 'true' ? { fileParallelism: false } : {}),
    exclude: ['**/node_modules/**', '**/.git/**', ...dbIntegrationTestGlobs],
    coverage: {
      reporter: ['text', 'html'],
    },
    server: {
      deps: {
        inline: ['next-auth', 'next/server'],
      },
    },
  },
});