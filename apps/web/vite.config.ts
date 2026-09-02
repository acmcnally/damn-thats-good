import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Dev only: forward API calls to the NestJS process so the browser sees one origin
    // (no CORS). In the Compose stack, Caddy does this instead (Phase D).
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
});
