import type { Matchup } from "@/types/headsup";

/** Smallest power of 2 that is >= n. */
export function nextPowerOf2(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/** Number of rounds in a single-elimination bracket for n competitors. */
export function totalRoundsFor(n: number): number {
  return Math.ceil(Math.log2(n));
}

/**
 * Standard bracket seeding for a power-of-2 bracket size.
 * Returns 1-indexed seed pairs in bracket position order.
 *
 * Example for 8: [[1,8],[4,5],[2,7],[3,6]]
 * This ensures the top two seeds only meet in the final.
 */
export function bracketPairings(bracketSize: number): [number, number][] {
  if (bracketSize === 2) return [[1, 2]];

  const smaller = bracketPairings(bracketSize / 2);
  const sum = bracketSize + 1;
  const pairs: [number, number][] = [];

  for (const [a, b] of smaller) {
    pairs.push([a, sum - a]);
    pairs.push([b, sum - b]);
  }

  return pairs;
}

/**
 * Build the first round of a bracket from seed-ordered recipe IDs.
 *
 * Returns:
 * - matchups: head-to-head pairs where both seeds exist (what the user sees)
 * - bracketWinners: one entry per bracket position — the bye winner's ID, or
 *   null for positions that need to be played. Matchup winners get filled in
 *   as the user picks.
 */
export function buildFirstRound(ids: string[]): {
  matchups: Matchup[];
  bracketWinners: (string | null)[];
} {
  const bracketSize = nextPowerOf2(ids.length);
  const pairings = bracketPairings(bracketSize);
  const matchups: Matchup[] = [];
  const bracketWinners: (string | null)[] = [];

  for (const [seedA, seedB] of pairings) {
    const idA = ids[seedA - 1] as string | undefined;
    const idB = ids[seedB - 1] as string | undefined;

    if (idA && idB) {
      matchups.push({ id1: idA, id2: idB });
      bracketWinners.push(null); // to be filled by user
    } else if (idA) {
      bracketWinners.push(idA); // bye
    } else if (idB) {
      bracketWinners.push(idB); // bye
    }
  }

  return { matchups, bracketWinners };
}

/**
 * Build the next round from the previous round's winners.
 * Winners are in bracket position order, so adjacent pairs face each other.
 * After round 1 the count is always even (power of 2), so no byes.
 */
export function buildNextRound(winners: string[]): Matchup[] {
  const matchups: Matchup[] = [];
  for (let i = 0; i < winners.length; i += 2) {
    matchups.push({ id1: winners[i], id2: winners[i + 1] });
  }
  return matchups;
}
