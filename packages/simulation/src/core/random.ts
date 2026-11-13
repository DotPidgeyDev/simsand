// Mulberry32: a small seeded generator returning values in [0, 1).
export function createRandom(seed: number): () => number {
  let state = seed;

  return () => {
    state = (state + 0x6D2B79F5) | 0;

    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);

    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
