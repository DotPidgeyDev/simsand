import { COMMAND_PROTOCOL_VERSION } from '@simsand/shared';
import type { BasicNeed, CommandRequest, CommandResult, EntitySnapshot, ItemId } from '@simsand/shared';

const COMMAND_URL = '/streamer/commands';
// A click this many tiles from a character still selects them.
const PICK_RADIUS = 1.5;

// The streamer's intervention controls. Characters come from the same
// snapshots and deltas the map draws. Every command goes through the
// server's gateway, so the panel never decides what is allowed.
export function createStreamerPanel(
  form: HTMLFormElement,
  options: { onSelect: (id: string | undefined) => void },
) {
  const target = field<HTMLSelectElement>(form, 'target');
  const need = field<HTMLSelectElement>(form, 'need');
  const item = field<HTMLSelectElement>(form, 'item');
  const giftQuantity = field<HTMLInputElement>(form, 'giftQuantity');
  const bountyQuantity = field<HTMLInputElement>(form, 'bountyQuantity');
  const bountyButton = form.querySelector<HTMLButtonElement>('[data-intervention="bounty"]')!;
  const status = form.querySelector<HTMLElement>('#streamer-status')!;

  const characters = new Map<string, EntitySnapshot>();
  let listed = '';
  let bountyArmed = false;

  function replaceCharacters(entities: readonly EntitySnapshot[]): void {
    characters.clear();
    updateCharacters(entities);
  }

  function updateCharacters(entities: readonly EntitySnapshot[]): void {
    for (const entity of entities) characters.set(entity.id, entity);
    refreshOptions();
  }

  function removeCharacters(ids: readonly string[]): void {
    for (const id of ids) characters.delete(id);
    refreshOptions();
  }

  // Rebuilt only when someone arrives, leaves, or dies, so an open list
  // is not reset every delta.
  function refreshOptions(): void {
    const living = [...characters.values()]
      .filter((entity) => entity.lifecycle !== 'dead')
      .map((entity) => entity.id)
      .sort();
    const key = living.join('\n');

    if (key === listed) return;

    listed = key;
    const selected = target.value;
    target.replaceChildren(
      new Option('Choose a character', ''),
      ...living.map((id) => new Option(id, id)),
    );
    target.value = living.includes(selected) ? selected : '';

    if (target.value !== selected) options.onSelect(target.value || undefined);
  }

  function select(id: string | undefined): void {
    target.value = id ?? '';
    options.onSelect(id);
  }

  // Selects the nearest living character to a map click, or places the
  // armed bounty on the clicked tile.
  function handleMapClick(point: { x: number; y: number }): void {
    if (bountyArmed) {
      setBountyArmed(false);
      void send({
        type: 'intervention.bounty',
        params: { x: Math.floor(point.x), y: Math.floor(point.y), quantity: quantityOf(bountyQuantity) },
      });
      return;
    }

    let nearest: string | undefined;
    let best = PICK_RADIUS;

    for (const entity of characters.values()) {
      if (entity.lifecycle === 'dead') continue;

      const distance = Math.hypot(entity.x - point.x, entity.y - point.y);

      if (distance < best) {
        best = distance;
        nearest = entity.id;
      }
    }

    if (nearest) select(nearest);
  }

  function setBountyArmed(armed: boolean): void {
    bountyArmed = armed;
    bountyButton.setAttribute('aria-pressed', String(armed));
    if (armed) show('Click a pile or a grass tile on the map', false);
  }

  async function send(command: CommandRequest): Promise<void> {
    show(`Sending ${command.type}…`, false);

    try {
      const response = await fetch(COMMAND_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ protocolVersion: COMMAND_PROTOCOL_VERSION, command }),
      });
      const result = await response.json() as CommandResult;

      if (result.status === 'applied') show(`${command.type} applied`, false);
      else show(result.message, true);
    } catch {
      show('The command server is not reachable', true);
    }
  }

  function show(message: string, rejected: boolean): void {
    status.textContent = message;
    status.classList.toggle('rejected', rejected);
  }

  function chosen(): string | undefined {
    if (target.value) return target.value;

    show('Choose a character first', true);
    return undefined;
  }

  target.addEventListener('change', () => options.onSelect(target.value || undefined));

  form.addEventListener('submit', (event) => event.preventDefault());

  form.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-intervention]');

    if (!button) return;

    switch (button.dataset.intervention) {
      case 'bless': {
        const characterId = chosen();
        if (characterId) void send({ type: 'intervention.bless', params: { characterId } });
        break;
      }
      // The gateway validates need and item; the options only offer valid ones.
      case 'curse': {
        const characterId = chosen();
        if (characterId) {
          void send({ type: 'intervention.curse', params: { characterId, need: need.value as BasicNeed } });
        }
        break;
      }
      case 'gift': {
        const characterId = chosen();
        if (characterId) {
          void send({
            type: 'intervention.gift',
            params: { characterId, item: item.value as ItemId, quantity: quantityOf(giftQuantity) },
          });
        }
        break;
      }
      case 'bounty':
        setBountyArmed(!bountyArmed);
        if (!bountyArmed) show('', false);
        break;
    }
  });

  return { replaceCharacters, updateCharacters, removeCharacters, handleMapClick };
}

function field<T extends HTMLElement>(form: HTMLFormElement, name: string): T {
  const element = form.elements.namedItem(name);

  if (!(element instanceof HTMLElement)) throw new Error(`Streamer panel is missing ${name}`);

  return element as T;
}

// The gateway enforces 1–5; this keeps an empty box from sending NaN.
function quantityOf(input: HTMLInputElement): number {
  const value = Math.round(Number(input.value));

  return Number.isFinite(value) ? value : 1;
}
