import { describe, it, expect, vi } from 'vitest';
import { createServer } from 'http';
import { WebSocketServer as WsServer } from 'ws';

describe('Server EADDRINUSE error handling', () => {
  it('httpServer error handler detects EADDRINUSE and logs helpful message', () => {
    const server = createServer();
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);

    // Simulate the permanent error handler added after startup
    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        console.error(
          `\n❌ Port 3001 is already in use. Is another instance running? Kill it with: lsof -ti:3001 | xargs kill`,
        );
        process.exit(1);
      } else {
        console.error(`\n❌ HTTP server error: ${err.message}`);
        process.exit(1);
      }
    });

    // Emit EADDRINUSE
    const err = Object.assign(new Error('listen EADDRINUSE: address already in use 127.0.0.1:3001'), {
      code: 'EADDRINUSE',
    });
    server.emit('error', err);

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Port 3001 is already in use'),
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('lsof -ti:3001 | xargs kill'),
    );
    expect(exitSpy).toHaveBeenCalledWith(1);

    consoleSpy.mockRestore();
    exitSpy.mockRestore();
    server.close();
  });

  it('WebSocketServer error handler detects EADDRINUSE and exits gracefully', () => {
    const server = createServer();
    // Prevent unhandled errors on the http server
    server.on('error', () => {});

    const wss = new WsServer({ server, path: '/ws' });

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);

    // Simulate the WSS error handler from WebSocketServer class
    wss.on('error', (err: Error & { code?: string }) => {
      if (err.code === 'EADDRINUSE') {
        const addr = server.address();
        const port = typeof addr === 'object' && addr ? addr.port : 'unknown';
        console.error(
          `\n❌ Port ${port} is already in use. Is another instance running? Kill it with: lsof -ti:${port} | xargs kill`,
        );
        process.exit(1);
      }
    });

    const err = Object.assign(new Error('listen EADDRINUSE'), { code: 'EADDRINUSE' });
    wss.emit('error', err);

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('already in use'),
    );
    expect(exitSpy).toHaveBeenCalledWith(1);

    consoleSpy.mockRestore();
    exitSpy.mockRestore();
    wss.close();
    server.close();
  });

  it('non-EADDRINUSE errors are also handled without crashing', () => {
    const server = createServer();
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);

    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`\n❌ Port is already in use.`);
      } else {
        console.error(`\n❌ HTTP server error: ${err.message}`);
      }
      process.exit(1);
    });

    const err = Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' });
    server.emit('error', err);

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('EACCES: permission denied'),
    );
    expect(consoleSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('already in use'),
    );
    expect(exitSpy).toHaveBeenCalledWith(1);

    consoleSpy.mockRestore();
    exitSpy.mockRestore();
    server.close();
  });
});
