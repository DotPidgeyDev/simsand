import { SimulationWorker } from './simulation-worker.js';
import { BrowserWebSocketServer } from './websocket-server.js';

const browserServer = new BrowserWebSocketServer(8766);

const simulation = new SimulationWorker((message) => {
  switch (message.type) {
    case 'world.ready':
      console.log('Simulation ready:', message.data);
      simulation.requestSnapshot();
      break;

    case 'world.snapshot':
      browserServer.setLatestSnapshot(message.data);
      browserServer.broadcast({
        type: 'world.snapshot',
        data: message.data,
      });
      console.log(`World snapshot received: ${message.data.entities.length} entities`);
    break;

    case 'world.delta':
      browserServer.applyDelta(message.data);
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