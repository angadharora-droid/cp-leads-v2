// Temporary: local smoke run against the backend on 5055. Delete after testing.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  server: {
    port: 5175,
    strictPort: true,
    proxy: { '/api': { target: 'http://localhost:5055', changeOrigin: true } },
  },
});
