import type { WorldSnapshot, WorldDelta } from '@simsand/shared';

export type ServerMessage =
  | { type: 'world.snapshot'; data: WorldSnapshot }
  | { type: 'world.delta'; data: WorldDelta };

export function connectToSimulation(
  onMessage: (message: ServerMessage) => void,
): WebSocket {
  const socket = new WebSocket('ws://localhost:8766');

  socket.addEventListener('open', () => {
    console.log('Connected to simulation server');
  });

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data) as ServerMessage;
    onMessage(message);
  });

  socket.addEventListener('close', () => {
    console.log('Disconnected from simulation server');
  });

  socket.addEventListener('error', (error) => {
    console.error('Simulation WebSocket error:', error);
  });

  return socket;
}