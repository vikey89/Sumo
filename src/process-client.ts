import type { CpuHistory } from './fans';
import type { AppInfo, AppSnapshot, ConnectionState } from './types';

// The `sumo` binary serves the arena itself; under Vite the engine runs on its own port.
const ENGINE_HOST = import.meta.env.DEV ? '127.0.0.1:3001' : location.host;
const API_URL = `http://${ENGINE_HOST}`;
const SOCKET_URL = `ws://${ENGINE_HOST}/ws`;

export class ProcessClient {
  private socket?: WebSocket;
  private reconnectTimer?: number;
  private attempts = 0;
  private stopped = false;

  constructor(
    private readonly onSnapshot: (snapshot: AppSnapshot) => void,
    private readonly onState: (state: ConnectionState) => void,
  ) {}

  async start(): Promise<void> {
    this.onState('connecting');
    try {
      const response = await fetch(`${API_URL}/api/processes`, { cache: 'no-store' });
      if (response.ok) this.onSnapshot(await response.json() as AppSnapshot);
    } catch {
      // The WebSocket reconnect loop reports connection state.
    }
    this.connect();
  }

  private connect(): void {
    if (this.stopped) return;
    const socket = new WebSocket(SOCKET_URL);
    this.socket = socket;

    socket.addEventListener('open', () => {
      this.attempts = 0;
      this.onState('live');
    });

    socket.addEventListener('message', (event) => {
      try {
        this.onSnapshot(JSON.parse(event.data as string) as AppSnapshot);
      } catch {
        // Ignore a malformed update and wait for the next snapshot.
      }
    });

    socket.addEventListener('close', () => {
      if (this.stopped) return;
      this.onState('reconnecting');
      const delay = Math.min(1000 * 2 ** this.attempts++, 8000);
      this.reconnectTimer = window.setTimeout(() => this.connect(), delay);
    });

    socket.addEventListener('error', () => socket.close());
  }

  /** The engine's last ten minutes of CPU load. */
  async history(): Promise<CpuHistory | undefined> {
    try {
      const response = await fetch(`${API_URL}/api/history`, { cache: 'no-store' });
      return response.ok ? await response.json() as CpuHistory : undefined;
    } catch {
      return undefined;
    }
  }

  /** Ask the engine to close an app; resolves to a short failure reason, or undefined. */
  async quit(app: AppInfo): Promise<string | undefined> {
    try {
      const response = await fetch(`${API_URL}/api/quit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pids: app.pids }),
      });
      if (response.ok) return undefined;
      if (response.status === 403) return 'protected by the system';
      if (response.status === 404) return 'already quit';
      return `error ${response.status}`;
    } catch {
      return 'engine unreachable';
    }
  }

  dispose(): void {
    this.stopped = true;
    window.clearTimeout(this.reconnectTimer);
    this.socket?.close();
  }
}
