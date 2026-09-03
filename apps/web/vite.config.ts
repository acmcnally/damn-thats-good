import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Pick up the repo-root .env so the dev proxy honours API_PORT (same value the API reads).
try {
  process.loadEnvFile(fileURLToPath(new URL('../../.env', import.meta.url)));
} catch {
  // no .env — fall through to the default
}
const apiPort = process.env.API_PORT ?? '3000';

export default defineConfig({
  plugins: [react()],
  server: {
    // Bind all interfaces (IPv4 + IPv6) — VS Code / SSH port forwarding connects over
    // IPv4, and Vite's default `localhost` can resolve to IPv6-only.
    host: true,
    port: 5173,
    strictPort: true,
    // Dev only: forward API calls to the NestJS process so the browser sees one origin
    // (no CORS). In the Compose stack, Caddy does this instead (Phase D).
    proxy: {
      '/api': `http://localhost:${apiPort}`,
    },
  },
});
