import { CHRONICLE_PRESENTATION, chronicleTierAtLeast } from '@simsand/shared';

import { createChronicleFeed } from './feed.js';
import { createStreamerPanel } from './streamer-panel.js';
import { connectToSimulation } from './websocket.js';
import { createRenderer } from './renderer.js';

const container = document.querySelector<HTMLElement>('#world');
const feedList = document.querySelector<HTMLElement>('#chronicle');
const streamerForm = document.querySelector<HTMLFormElement>('#streamer');

if (!container || !feedList || !streamerForm) {
  throw new Error('World, chronicle or streamer panel container not found');
}

const renderer = await createRenderer(container);
const feed = createChronicleFeed(feedList);
const panel = createStreamerPanel(streamerForm, { onSelect: (id) => renderer.select(id) });

renderer.onMapClick((point) => panel.handleMapClick(point));

connectToSimulation((message) => {
  switch (message.type) {
    case 'world.snapshot':
      console.log('World snapshot received at tick', message.data.tick);
      renderer.setMap(message.data.map);
      renderer.replaceNodes(message.data.nodes);
      renderer.replaceEntities(message.data.entities);
      panel.replaceCharacters(message.data.entities);
      break;

    case 'world.delta':
        renderer.removeEntities(message.data.removed);
        renderer.updateEntities(message.data.entities);
        panel.removeCharacters(message.data.removed);
        panel.updateCharacters(message.data.entities);
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

        if (chronicleTierAtLeast(entry.tier, CHRONICLE_PRESENTATION.focus)) {
          renderer.focus(entry.location);
        }
      }
      break;
    }
});
