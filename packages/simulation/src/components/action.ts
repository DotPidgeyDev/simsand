import type { ActionId } from '@simsand/shared';

export const Action = {
  // Index into ACTION_IDS.
  kind: [] as number[],
  // Seconds spent on the current choice. Zero means they have not chosen yet.
  elapsed: [] as number[],
  // Seconds until that action may be chosen again.
  cooldown: {
    idle: [] as number[],
    move: [] as number[],
    eat: [] as number[],
    rest: [] as number[],
    drink: [] as number[],
  } satisfies Record<ActionId, number[]>,
  // Index into ACTION_IDS for the action that just ended. -1 means none yet.
  outcomeAction: [] as number[],
  // Index into ACTION_OUTCOMES. Meaningful only when outcomeAction is not -1.
  outcomeResult: [] as number[],
};
