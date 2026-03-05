import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const serverPort = process.env.SERVER_PORT || '3001';

function getGitHash(): string {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    return 'unknown';
  }
}

// Read from the root package.json — this is the published package version
// that represents the overall Flightdeck release, not the web workspace version.
function getAppVersion(): string {
  try {
    const rootPkg = JSON.parse(
      readFileSync(resolve(__dirname, '../../package.json'), 'utf-8'),
    );
    return rootPkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(getAppVersion()),
    __GIT_HASH__: JSON.stringify(getGitHash()),
  },
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': `http://localhost:${serverPort}`,
      '/ws': {
        target: `ws://localhost:${serverPort}`,
        ws: true,
        // Suppress ECONNRESET / EPIPE errors when backend restarts or drops connections
        configure: (proxy) => {
          proxy.on('error', () => {});
          proxy.on('proxyReqWs', (_proxyReq, _req, socket) => {
            socket.on('error', () => {});
          });
          proxy.on('open', (socket) => {
            socket.on('error', () => {});
          });
          proxy.on('close', (_res, socket) => {
            socket?.on?.('error', () => {});
          });
        },
      },
    },
  },
});
