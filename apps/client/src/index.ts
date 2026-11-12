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
      console.log('World snapshot received at tick', message.data.tick);
      renderer.replaceEntities(message.data.entities);
      break;

    case 'world.delta':
        renderer.removeEntities(message.data.removed);
        renderer.updateEntities(message.data.entities);
        break;
    }
});