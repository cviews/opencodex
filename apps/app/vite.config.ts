import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@opencodex/ui': path.resolve(__dirname, '../../packages/ui/src/index.ts'),
      '@opencodex/types': path.resolve(__dirname, '../../packages/types/src/index.ts'),
    },
  },
});
