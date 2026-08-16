import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const API = process.env.VITE_SERVER_URL ?? 'http://localhost:4000';

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Use the shared package's source so client HMR picks up edits to it
    // without a rebuild; the server consumes the compiled dist instead.
    alias: {
      '@quizzards/shared': fileURLToPath(new URL('../shared/src/index.ts', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    // Talk to the scoreboard server through the dev server so the browser
    // sees a single origin and websockets upgrade cleanly.
    proxy: {
      '/api': { target: API, changeOrigin: true },
      '/socket.io': { target: API, ws: true, changeOrigin: true },
    },
  },
  build: { outDir: 'dist', sourcemap: true },
});
