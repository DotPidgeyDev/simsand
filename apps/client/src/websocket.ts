import type { WorldSnapshot, WorldDelta } from '@simsand/shared';

export type ServerMessage =
  | { type: 'world.snapshot'; data: WorldSnapshot }
  | { type: 'world.delta'; data: WorldDelta };

const SERVER_URL = 'ws://localhost:8766';
const INITIAL_RECONNECT_DELAY_MS = 500;
const MAX_RECONNECT_DELAY_MS = 5000;

export interface SimulationConnection {
  close(): void;
}

export function connectToSimulation(
  onMessage: (message: ServerMessage) => void,
): SimulationConnection {
  let socket: WebSocket | undefined;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let reconnectDelay = INITIAL_RECONNECT_DELAY_MS;
  let closedByClient = false;

  // Deltas only describe changes, so a new socket must not apply any until
  // the server's snapshot for that connection has arrived.
  let awaitingSnapshot = true;

  function connect(): void {
    socket = new WebSocket(SERVER_URL);
    awaitingSnapshot = true;

    socket.addEventListener('open', () => {
      console.log('Connected to simulation server');
      reconnectDelay = INITIAL_RECONNECT_DELAY_MS;
    });

    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data) as ServerMessage;

      if (message.type === 'world.snapshot') {
        awaitingSnapshot = false;
      } else if (awaitingSnapshot) {
        return;
      }

      onMessage(message);
    });

    socket.addEventListener('close', () => {
      console.log('Disconnected from simulation server');

      if (!closedByClient) {
        scheduleReconnect();
      }
    });

    socket.addEventListener('error', (error) => {
      console.error('Simulation WebSocket error:', error);
    });
  }

  function scheduleReconnect(): void {
    console.log(`Reconnecting in ${reconnectDelay}ms`);

    reconnectTimer = setTimeout(connect, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY_MS);
  }

  connect();

  return {
    close() {
      closedByClient = true;
      clearTimeout(reconnectTimer);
      socket?.close();
    },
  };
}
