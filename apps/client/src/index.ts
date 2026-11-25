import { CHRONICLE_PRESENTATION, chronicleTierAtLeast } from '@simsand/shared';

import { createChronicleFeed } from './feed.js';
import { connectToSimulation } from './websocket.js';
import { createRenderer } from './renderer.js';

const container = document.querySelector<HTMLElement>('#world');
const feedList = document.querySelector<HTMLElement>('#chronicle');

if (!container || !feedList) {
  throw new Error('World or chronicle container not found');
}

const renderer = await createRenderer(container);
const feed = createChronicleFeed(feedList);

connectToSimulation((message) => {
  switch (message.type) {
    case 'world.snapshot':
      console.log('World snapshot received at tick', message.data.tick);
      renderer.setMap(message.data.map);
      renderer.replaceNodes(message.data.nodes);
      renderer.replaceEntities(message.data.entities);
      break;

    case 'world.delta':
        renderer.removeEntities(message.data.removed);
        renderer.updateEntities(message.data.entities);
        if (message.data.nodes) {
          renderer.replaceNodes(message.data.nodes);
        }
        break;

    case 'world.chronicle':
      feed.add(message.data.entries);

      for (const entry of message.data.entries) {
        if (chronicleTierAtLeast(entry.tier, CHRONICLE_PRESENTATION.notify)) {
          renderer.pulse(entry.participants);
        }
      }
      break;
    }
});