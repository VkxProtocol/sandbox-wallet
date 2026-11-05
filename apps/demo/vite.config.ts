import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  base: './',
  plugins: [react(), nodePolyfills({ include: ['buffer', 'process', 'stream', 'util'] })],
  resolve: {
    alias: {
      '@sandbox-wallet/core': fileURLToPath(new URL('../../packages/core/src/index.ts', import.meta.url)),
    },
  },
  server: { fs: { allow: ['../..'] } },
  build: {
    outDir: '../../docs/app',
    emptyOutDir: true,
    target: 'es2022',
  },
});
