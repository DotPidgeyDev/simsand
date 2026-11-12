import { SimulationWorker } from './simulation-worker.js';
import { BrowserWebSocketServer } from './websocket-server.js';
import { WorldSnapshot } from '@simsand/shared';

const browserServer = new BrowserWebSocketServer(8766);

let latestSnapshot: WorldSnapshot | undefined;

const simulation = new SimulationWorker((message) => {
  switch (message.type) {
    case 'world.ready':
      console.log('Simulation ready:', message.data);
      simulation.requestSnapshot();
      break;

    case 'world.snapshot':
      latestSnapshot = message.data;
      browserServer.setLatestSnapshot(message.data);
      browserServer.broadcast({
        type: 'world.snapshot',
        data: message.data,
      });
      console.log(`World snapshot received: ${message.data.entities.length} entities`);
    break;

    case 'world.delta':
      browserServer.broadcast({
        type: 'world.delta',
        data: message.data,
      });
      break;

    case 'world.error':
      console.error('Simulation error:', message.data.message);
      break;
  }
});

simulation.start({ seed: 12345, population: 20 });

process.on('SIGINT', async () => {
  console.log('Stopping simulation...');
  await simulation.stop();
  await browserServer.close();
  process.exit(0);
});