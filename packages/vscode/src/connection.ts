import * as vscode from 'vscode';

/**
 * Manages the HTTP/WS connection to the Flightdeck server.
 * Provides REST fetch helpers and connection state.
 */
export class FlightdeckConnection {
  private _connected = false;
  private _serverUrl = 'http://localhost:3001';

  private readonly _onDidChangeConnection = new vscode.EventEmitter<boolean>();
  readonly onDidChangeConnection = this._onDidChangeConnection.event;

  get connected(): boolean {
    return this._connected;
  }

  get serverUrl(): string {
    return this._serverUrl;
  }

  async connect(): Promise<void> {
    this._serverUrl = vscode.workspace.getConfiguration('flightdeck').get<string>('serverUrl', 'http://localhost:3001');
    try {
      const res = await fetch(`${this._serverUrl}/api/health`);
      if (res.ok) {
        this._connected = true;
        this._onDidChangeConnection.fire(true);
        vscode.commands.executeCommand('setContext', 'flightdeck.connected', true);
      }
    } catch {
      this._connected = false;
      this._onDidChangeConnection.fire(false);
    }
  }

  disconnect(): void {
    this._connected = false;
    this._onDidChangeConnection.fire(false);
    vscode.commands.executeCommand('setContext', 'flightdeck.connected', false);
  }

  /** Fetch JSON from the Flightdeck API. Returns null on failure. */
  async fetchJson<T>(path: string): Promise<T | null> {
    if (!this._connected) return null;
    try {
      const res = await fetch(`${this._serverUrl}/api${path}`);
      if (!res.ok) return null;
      return await res.json() as T;
    } catch {
      return null;
    }
  }

  dispose(): void {
    this.disconnect();
    this._onDidChangeConnection.dispose();
  }
}
