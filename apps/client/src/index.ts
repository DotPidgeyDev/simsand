import { connectToSimulation } from './websocket.js';
import { createRenderer } from './renderer.js';

const container = document.querySelector<HTMLElement>('#world');

if (!container) {
  throw new Error('World container not found');
}

const renderer = await createRenderer(container);

connectToSimulation((message) => {
  switch (message.type) {
    case 'world.snapshot':
      console.log('Initial world snapshot received');
      renderer.updateEntities(message.data.entities);
      break;

    case 'world.delta':
        renderer.updateEntities(message.data.entities);
        break;
    }
});