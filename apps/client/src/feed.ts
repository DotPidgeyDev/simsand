import type { ChronicleEntry } from '@simsand/shared';

const FEED_LIMIT = 8;

// The newest chronicle entries, newest at the top.
export function createChronicleFeed(container: HTMLElement) {
  const seen = new Set<string>();

  function add(entries: readonly ChronicleEntry[]): void {
    for (const entry of entries) {
      if (seen.has(entry.eventId)) continue;

      seen.add(entry.eventId);

      const item = document.createElement('li');
      item.className = `tier-${entry.tier}`;
      item.textContent = entry.summary;
      container.prepend(item);
    }

    while (container.children.length > FEED_LIMIT) {
      container.lastElementChild?.remove();
    }
  }

  return { add };
}
