import { describe, expect, it } from 'vitest';

import type { ActionLogEvent } from '@simsand/shared';

import { Needs } from '../components/needs.js';
import { createSimulationClock } from '../core/clock.js';
import type { SimulationClock } from '../core/clock.js';
import { createWorldMap } from '../core/map.js';
import { createSimulationRunner, tickSimulation } from '../core/runner.js';
import { createSimulationWorld } from '../core/world.js';
import type { SimulationWorld } from '../core/world.js';
import { grantItem, heldQuantity } from '../economy/inventory.js';
import { nodeKey } from '../economy/nodes.js';
import { createCharacter } from '../entities/create-character.js';
import { chronicleFromEvents } from '../storytelling/chronicle.js';
import { FATIGUE_REST_AT } from '../systems/needs.js';
import { updateDirector } from './director.js';
import { directorDefaults, readDirectorSettings } from './settings.js';
import type { DirectorSettings } from './settings.js';

const {
  actSeconds: DIRECTOR_ACT_SECONDS,
  targetSeconds: DIRECTOR_TARGET_SECONDS,
  mercyAfterSeconds: MERCY_AFTER_SECONDS,
} = directorDefaults;

function setup(people: Array<{ id: string; x: number; y: number }>) {
  const world = createSimulationWorld(createWorldMap(32, 32, 'grass'), 1);
  const clock = createSimulationClock();
  const eids = new Map<string, number>();

  for (const { id, x, y } of people) {
    const eid = createCharacter(world, { id, x, y, velocityX: 0, velocityY: 0, color: 0xffffff, sprite: 'wanderer' });

    Needs.hunger[eid] = 0.1;
    Needs.thirst[eid] = 0.1;
    Needs.fatigue[eid] = 0.1;
    eids.set(id, eid);
  }

  return { world, clock, eids };
}

// Runs one director check at this many elapsed seconds.
function checkAt(
  world: SimulationWorld,
  clock: SimulationClock,
  seconds: number,
  settings: Readonly<DirectorSettings> = directorDefaults,
): void {
  clock.tick = Math.round(seconds / clock.fixedDeltaSeconds);
  clock.elapsedSeconds = seconds;
  world.tick = clock.tick;
  world.elapsedSeconds = seconds;
  updateDirector(world, clock, settings);
}

function kindAct(id: number, initiator: string, other: string, seconds: number): ActionLogEvent {
  return {
    eventId: `log-${id}`,
    type: 'character.comforted',
    tick: seconds * 10,
    elapsedSeconds: seconds,
    participants: [initiator, other],
    location: { x: 1, y: 1 },
    payload: { action: 'comfort', result: 'completed', initiator },
  };
}

describe('world director', () => {
  it('feeds someone who has gone hungry with no food and nobody near to buy from', () => {
    const { world, clock, eids } = setup([{ id: 'hungry', x: 4.5, y: 4.5 }]);
    Needs.hunger[eids.get('hungry')!] = 0.9;

    checkAt(world, clock, 0);
    checkAt(world, clock, MERCY_AFTER_SECONDS - 5);

    expect(world.log).toEqual([]);

    checkAt(world, clock, MERCY_AFTER_SECONDS);

    expect(heldQuantity(world, 'hungry', 'food')).toBe(1);
    expect(world.log).toMatchObject([{
      type: 'intervention.gifted',
      payload: {
        commandId: `director-${MERCY_AFTER_SECONDS * 10}`,
        issuer: { source: 'system', id: 'world-director' },
        reason: 'mercy',
        target: 'hungry',
        item: 'food',
        quantity: 1,
      },
    }]);
    expect(chronicleFromEvents(world.log)[0]?.summary).toBe('hungry received 1 food in their hunger');
  });

  it('leaves a hungry character to a neighbour who holds food', () => {
    const { world, clock, eids } = setup([
      { id: 'hungry', x: 4.5, y: 4.5 },
      { id: 'cook', x: 6.5, y: 4.5 },
    ]);
    Needs.hunger[eids.get('hungry')!] = 0.9;
    grantItem(world, 'cook', 'food', 2);

    checkAt(world, clock, 0);
    checkAt(world, clock, MERCY_AFTER_SECONDS);

    expect(world.log).toEqual([]);
  });

  it('brings back the site that would wait longest when most piles are gone', () => {
    const { world, clock } = setup([]);
    world.nodes.set(nodeKey(32, 1, 1), { x: 1, y: 1, item: 'material', quantity: 3 });
    world.returning.set(nodeKey(32, 5, 5), 100);
    world.returning.set(nodeKey(32, 9, 2), 200);

    checkAt(world, clock, 10);

    expect(world.nodes.get(nodeKey(32, 9, 2))).toEqual({ x: 9, y: 2, item: 'material', quantity: 3 });
    expect(world.returning.has(nodeKey(32, 5, 5))).toBe(true);
    expect(chronicleFromEvents(world.log)[0]?.summary).toBe('A bounty of 3 material appeared at (9, 2) as piles ran low');
  });

  it('blesses someone who has been kind three times recently', () => {
    const { world, clock, eids } = setup([
      { id: 'kind', x: 4.5, y: 4.5 },
      { id: 'sad', x: 5.5, y: 4.5 },
    ]);
    Needs.hunger[eids.get('kind')!] = 0.6;
    world.log.push(kindAct(1, 'kind', 'sad', 10), kindAct(2, 'kind', 'sad', 40), kindAct(3, 'kind', 'sad', 70));
    world.nextLogId = 4;

    checkAt(world, clock, 80);

    expect(Needs.hunger[eids.get('kind')!]).toBe(0);
    expect(chronicleFromEvents(world.log).at(-1)?.summary).toBe('kind was blessed for their kindness');
  });

  it('does not count kindness older than its window', () => {
    const { world, clock } = setup([{ id: 'kind', x: 4.5, y: 4.5 }, { id: 'sad', x: 5.5, y: 4.5 }]);
    world.log.push(kindAct(1, 'kind', 'sad', 10), kindAct(2, 'kind', 'sad', 40), kindAct(3, 'kind', 'sad', 70));
    world.nextLogId = 4;

    checkAt(world, clock, 400);

    expect(world.log).toHaveLength(3);
  });

  it('wearies someone who holds far more than everyone else', () => {
    const { world, clock, eids } = setup([
      { id: 'miser', x: 4.5, y: 4.5 },
      { id: 'poor', x: 8.5, y: 4.5 },
    ]);
    grantItem(world, 'miser', 'goods', 12);
    grantItem(world, 'poor', 'goods', 1);

    checkAt(world, clock, 10);

    expect(Needs.fatigue[eids.get('miser')!]).toBe(FATIGUE_REST_AT);
    expect(chronicleFromEvents(world.log)[0]?.summary).toBe('miser was cursed with fatigue for hoarding');
  });

  it('acts once a minute at most, waits five on a character, and curses only a bigger hoard', () => {
    const { world, clock, eids } = setup([
      { id: 'miser', x: 4.5, y: 4.5 },
      { id: 'poor', x: 8.5, y: 4.5 },
    ]);
    const miser = eids.get('miser')!;
    grantItem(world, 'miser', 'goods', 12);

    checkAt(world, clock, 10);
    world.log.length = 0;
    // Rested again, so only the waits stand in the way.
    Needs.fatigue[miser] = 0.1;
    checkAt(world, clock, 10 + DIRECTOR_ACT_SECONDS - 5);
    checkAt(world, clock, 10 + DIRECTOR_ACT_SECONDS + 5);

    expect(world.log).toEqual([]);
    expect(world.director.targeted.get('miser')).toBe(10);

    // The same hoard is not cursed twice.
    checkAt(world, clock, 10 + DIRECTOR_TARGET_SECONDS);

    expect(world.log).toEqual([]);

    grantItem(world, 'miser', 'goods', 1);
    checkAt(world, clock, 10 + DIRECTOR_TARGET_SECONDS + 5);

    expect(world.log).toHaveLength(1);
    expect(world.director.cursedHoldings.get('miser')).toBe(13);
  });

  it('runs only when the runner asks for it', () => {
    const quiet = setup([{ id: 'miser', x: 4.5, y: 4.5 }, { id: 'poor', x: 8.5, y: 4.5 }]);
    grantItem(quiet.world, 'miser', 'goods', 12);
    tickSimulation(createSimulationRunner(quiet.world, quiet.clock));

    expect(quiet.world.log.some((event) => event.type === 'intervention.cursed')).toBe(false);

    tickSimulation(createSimulationRunner(quiet.world, createSimulationClock(), { director: true }));

    expect(quiet.world.log.some((event) => event.type === 'intervention.cursed')).toBe(true);
  });

  it('skips a rule that is switched off and moves on to the next', () => {
    const { world, clock } = setup([
      { id: 'miser', x: 4.5, y: 4.5 },
      { id: 'kind', x: 8.5, y: 4.5 },
    ]);
    grantItem(world, 'miser', 'goods', 12);
    world.log.push(kindAct(1, 'kind', 'miser', 10), kindAct(2, 'kind', 'miser', 20), kindAct(3, 'kind', 'miser', 30));
    world.nextLogId = 4;

    checkAt(world, clock, 40, { ...directorDefaults, rules: { ...directorDefaults.rules, kindness: false } });

    expect(world.log.at(-1)).toMatchObject({ type: 'intervention.cursed', payload: { reason: 'hubris' } });
  });

  it('follows the thresholds it is given', () => {
    const { world, clock } = setup([
      { id: 'miser', x: 4.5, y: 4.5 },
      { id: 'poor', x: 8.5, y: 4.5 },
    ]);
    grantItem(world, 'miser', 'goods', 12);

    checkAt(world, clock, 10, { ...directorDefaults, hoardMinItems: 20 });
    expect(world.log).toEqual([]);

    checkAt(world, clock, 15, { ...directorDefaults, hoardMinItems: 10 });
    expect(world.log).toHaveLength(1);
  });
});

describe('director settings', () => {
  it('uses the defaults when nothing is set', () => {
    expect(readDirectorSettings({})).toEqual(directorDefaults);
  });

  it('is off when SIMSAND_DIRECTOR=off', () => {
    expect(readDirectorSettings({ SIMSAND_DIRECTOR: 'off' })).toBeNull();
  });

  it('keeps only the rules named and reads overrides', () => {
    expect(readDirectorSettings({
      SIMSAND_DIRECTOR_RULES: 'mercy, scarcity',
      SIMSAND_DIRECTOR_ACT_SECONDS: '30',
      SIMSAND_DIRECTOR_HOARD_FACTOR: '2.5',
    })).toEqual({
      ...directorDefaults,
      rules: { mercy: true, scarcity: true, kindness: false, hubris: false },
      actSeconds: 30,
      hoardFactor: 2.5,
    });
  });

  it('refuses unknown rules and bad numbers', () => {
    expect(() => readDirectorSettings({ SIMSAND_DIRECTOR_RULES: 'mercy,smite' })).toThrow('unknown rule: smite');
    expect(() => readDirectorSettings({ SIMSAND_DIRECTOR_CHECK_SECONDS: '0' })).toThrow('greater than zero');
    expect(() => readDirectorSettings({ SIMSAND_DIRECTOR_ACT_SECONDS: '-1' })).toThrow('zero or more');
    expect(() => readDirectorSettings({ SIMSAND_DIRECTOR_KINDNESS_ACTS: '2.5' })).toThrow('whole number');
  });
});
