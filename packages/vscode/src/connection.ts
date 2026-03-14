import * as vscode from 'vscode';
import WebSocket from 'ws';
import * as http from 'http';
import * as https from 'https';
import type { ServerMessage } from './types';

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

export { ServerMessage };

/**
 * Manages the WebSocket + REST connection to the Flightdeck server.
 *
 * Features:
 * - Health check before WebSocket connect
 * - Auto-reconnect on disconnect (3s interval)
 * - Heartbeat monitoring via WebSocket pong (45s timeout)
 * - Subscribe to all channels on connect
 * - State change and message events for UI updates
 * - REST fetch helper for on-demand data loading
 */
export class FlightdeckConnection {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
  private _state: ConnectionState = 'disconnected';
  private _serverUrl = '';
  private shouldReconnect = false;

  private readonly _onStateChange = new vscode.EventEmitter<ConnectionState>();
  readonly onStateChange = this._onStateChange.event;

  private readonly _onMessage = new vscode.EventEmitter<ServerMessage>();
  readonly onMessage = this._onMessage.event;

  private readonly RECONNECT_INTERVAL = 3000;
  private readonly HEARTBEAT_TIMEOUT = 45000;

  /** Tracks the last emitted connected boolean to avoid duplicate fires. */
  private _lastConnectedValue = false;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly log: vscode.OutputChannel,
  ) {}

  get state(): ConnectionState {
    return this._state;
  }

  /** Whether the WebSocket is currently connected. */
  get connected(): boolean {
    return this._state === 'connected';
  }

  get serverUrl(): string {
    return this._serverUrl;
  }

  private setState(state: ConnectionState): void {
    if (this._state === state) return;
    this._state = state;
    this._onStateChange.fire(state);
  }

  /**
   * Convenience: subscribe to connected/disconnected transitions only.
   * Derived from onStateChange — fires true/false when the boolean changes.
   */
  onDidChangeConnection(listener: (connected: boolean) => void): vscode.Disposable {
    return this.onStateChange((state) => {
      const isConnected = state === 'connected';
      if (isConnected !== this._lastConnectedValue) {
        this._lastConnectedValue = isConnected;
        listener(isConnected);
      }
    });
  }

  /**
   * Resolve the server URL from (in priority order):
   * 1. Explicit `serverUrl` parameter
   * 2. VS Code setting `flightdeck.serverUrl`
   * 3. Environment variable `FLIGHTDECK_PORT` → `http://localhost:{port}`
   * 4. Default: `http://localhost:3001`
   */
  resolveServerUrl(serverUrl?: string): string {
    if (serverUrl) return serverUrl;

    const configUrl = vscode.workspace
      .getConfiguration('flightdeck')
      .get<string>('serverUrl');
    if (configUrl) return configUrl;

    const envPort = process.env.FLIGHTDECK_PORT;
    if (envPort) return `http://localhost:${envPort}`;

    return 'http://localhost:3001';
  }

  /**
   * Connect to the Flightdeck server.
   * Performs a health check via GET /health, then establishes a WebSocket.
   */
  async connect(serverUrl?: string): Promise<void> {
    if (this._state === 'connecting' || this._state === 'connected') {
      return;
    }

    this._serverUrl = this.resolveServerUrl(serverUrl);
    this.shouldReconnect = true;
    this.setState('connecting');
    this.log.appendLine(`Connecting to ${this._serverUrl}...`);

    try {
      const health = await this.fetch<{ status: string }>('/health');
      if (health.status !== 'ok') {
        throw new Error(`Unexpected health status: ${health.status}`);
      }
      this.log.appendLine('Health check passed');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log.appendLine(`Health check failed: ${msg}`);
      this.setState('error');
      this.scheduleReconnect();
      return;
    }

    this.connectWebSocket();
  }

  /** Disconnect from the server and stop reconnection attempts. */
  disconnect(): void {
    this.shouldReconnect = false;
    this.cleanup();
    this.setState('disconnected');
    this.log.appendLine('Disconnected');
  }

  /** Send a JSON message over the WebSocket. No-op if not connected. */
  send(msg: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  /**
   * Make a GET request to the server REST API.
   * @param path - API path relative to server URL (e.g. `/health`, `/api/projects`)
   * @returns Parsed JSON response body
   */
  async fetch<T>(path: string): Promise<T> {
    const baseUrl = this._serverUrl || this.resolveServerUrl();
    const url = new URL(path, baseUrl);
    const lib = url.protocol === 'https:' ? https : http;

    return new Promise<T>((resolve, reject) => {
      const req = lib.get(url, (res) => {
        if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`HTTP ${res.statusCode}: ${path}`));
          res.resume();
          return;
        }

        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => {
          body += chunk;
        });
        res.on('end', () => {
          try {
            resolve(JSON.parse(body) as T);
          } catch {
            reject(new Error(`Invalid JSON from ${path}`));
          }
        });
      });

      req.on('error', reject);
      req.setTimeout(5000, () => {
        req.destroy(new Error(`Request timeout: ${path}`));
      });
    });
  }

  /**
   * Fetch JSON from the Flightdeck REST API. Returns null on failure.
   * Used by tree providers and decorations for data loading.
   */
  async fetchJson<T>(path: string): Promise<T | null> {
    if (!this.connected) return null;
    try {
      return await this.fetch<T>(`/api${path}`);
    } catch {
      return null;
    }
  }

  /**
   * Make a POST/PATCH/etc request to the server REST API.
   * @param path - API path relative to server URL (e.g. `/api/agents/:id/message`)
   * @param options - method, body, headers
   * @returns { ok, status, data } — never throws
   */
  async postJson<T = unknown>(
    path: string,
    options: { method?: string; body?: unknown } = {},
  ): Promise<{ ok: boolean; status: number; data?: T }> {
    const baseUrl = this._serverUrl || this.resolveServerUrl();
    const url = new URL(`/api${path}`, baseUrl);
    const lib = url.protocol === 'https:' ? https : http;
    const method = options.method ?? 'POST';
    const payload = options.body !== undefined ? JSON.stringify(options.body) : undefined;

    return new Promise((resolve) => {
      const req = lib.request(url, { method, headers: {
        ...(payload ? { 'Content-Type': 'application/json' } : {}),
      } }, (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => { body += chunk; });
        res.on('end', () => {
          const ok = !!res.statusCode && res.statusCode >= 200 && res.statusCode < 300;
          let data: T | undefined;
          try { data = JSON.parse(body) as T; } catch { /* non-JSON response */ }
          resolve({ ok, status: res.statusCode ?? 0, data });
        });
      });

      req.on('error', () => resolve({ ok: false, status: 0 }));
      req.setTimeout(10000, () => {
        req.destroy();
        resolve({ ok: false, status: 0 });
      });
      if (payload) req.write(payload);
      req.end();
    });
  }

  /** Clean up all resources. Call from extension deactivate(). */
  dispose(): void {
    this.disconnect();
    this._onStateChange.dispose();
    this._onMessage.dispose();
  }

  // --- Private helpers ---

  private connectWebSocket(): void {
    const wsUrl = this._serverUrl.replace(/^http/, 'ws') + '/ws';
    this.log.appendLine(`WebSocket connecting to ${wsUrl}`);

    try {
      this.ws = new WebSocket(wsUrl);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log.appendLine(`WebSocket creation failed: ${msg}`);
      this.setState('error');
      this.scheduleReconnect();
      return;
    }

    this.ws.on('open', () => {
      this.log.appendLine('WebSocket connected');
      this.setState('connected');
      this.send({ type: 'subscribe', agentId: '*' });
      this.startHeartbeatMonitor();
    });

    this.ws.on('message', (data: WebSocket.RawData) => {
      this.resetHeartbeatMonitor();
      try {
        const msg = JSON.parse(data.toString()) as ServerMessage;
        this._onMessage.fire(msg);
      } catch {
        this.log.appendLine(
          `Invalid message: ${data.toString().slice(0, 200)}`,
        );
      }
    });

    this.ws.on('pong', () => {
      this.resetHeartbeatMonitor();
    });

    this.ws.on('close', (code: number, reason: Buffer) => {
      this.log.appendLine(`WebSocket closed: ${code} ${reason.toString()}`);
      this.cleanup();
      this.setState('disconnected');
      this.scheduleReconnect();
    });

    this.ws.on('error', (err: Error) => {
      this.log.appendLine(`WebSocket error: ${err.message}`);
      // 'close' event follows — reconnection handled there
    });
  }

  private startHeartbeatMonitor(): void {
    this.clearHeartbeatTimer();
    this.heartbeatTimer = setTimeout(() => {
      this.log.appendLine('Heartbeat timeout — reconnecting');
      this.ws?.terminate();
    }, this.HEARTBEAT_TIMEOUT);
  }

  private resetHeartbeatMonitor(): void {
    if (this._state === 'connected') {
      this.startHeartbeatMonitor();
    }
  }

  private clearHeartbeatTimer(): void {
    if (this.heartbeatTimer) {
      clearTimeout(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (!this.shouldReconnect || this.reconnectTimer) return;

    this.log.appendLine(
      `Reconnecting in ${this.RECONNECT_INTERVAL / 1000}s...`,
    );
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.shouldReconnect) {
        this.connectWebSocket();
      }
    }, this.RECONNECT_INTERVAL);
  }

  private cleanup(): void {
    this.clearHeartbeatTimer();

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.removeAllListeners();
      if (
        this.ws.readyState === WebSocket.OPEN ||
        this.ws.readyState === WebSocket.CONNECTING
      ) {
        this.ws.close();
      }
      this.ws = null;
    }
  }
}
