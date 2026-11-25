import { defineConfig } from 'vite';

const COMMAND_SERVER = `http://127.0.0.1:${process.env.SIMSAND_COMMAND_PORT ?? 8768}`;

// The command server sends no CORS headers and stays on localhost. The dev
// server forwards the streamer route to it so the page can use it.
export default defineConfig({
  server: {
    proxy: {
      '/streamer/commands': COMMAND_SERVER,
    },
  },
});
