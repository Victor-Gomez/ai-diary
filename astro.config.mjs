import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import tailwindcss from '@tailwindcss/vite';

// Local-first desktop app: SSR via the Node adapter so API routes can talk to
// the on-disk SQLite database. When packaged with Tauri later, the same API
// surface can be served by the embedded runtime or swapped for Tauri commands.
export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  server: { port: 4321 },
  vite: {
    plugins: [tailwindcss()],
    // Keep the native SQLCipher binding external so Vite/Rollup never tries to
    // bundle the prebuilt .node addon; Node resolves it from node_modules.
    ssr: { external: ['better-sqlite3-multiple-ciphers'] },
  },
});
