import { sortTiles } from "./tiles";
import type { Suit, Tile } from "./types";

export type WinningPattern = "standard" | "seven-pairs" | "thirteen-orphans";

export interface RiichiOption {
  discardId: string;
  waits: Tile[];
}

export function tileToIndex(tile: Tile): number {
  if (tile.suit === "man") return tile.rank - 1;
  if (tile.suit === "pin") return 9 + tile.rank - 1;
  if (tile.suit === "sou") return 18 + tile.rank - 1;
  return 27 + tile.rank - 1;
}

export function indexToTile(index: number): Tile {
  let suit: Suit;
  let rank: number;
  if (index < 9) {
    suit = "man";
    rank = index + 1;
  } else if (index < 18) {
    suit = "pin";
    rank = index - 9 + 1;
  } else if (index < 27) {
    suit = "sou";
    rank = index - 18 + 1;
  } else {
    suit = "honor";
    rank = index - 27 + 1;
  }
  return { id: `wait-${suit}-${rank}`, suit, rank, copy: 0 };
}

function tileCounts(tiles: Tile[]): number[] {
  const counts = Array(34).fill(0) as number[];
  for (const tile of tiles) counts[tileToIndex(tile)] += 1;
  return counts;
}

function canFormMelds(counts: number[], memo: Map<string, boolean>): boolean {
  const key = counts.join("");
  const cached = memo.get(key);
  if (cached !== undefined) return cached;

  const first = counts.findIndex((count) => count > 0);
  if (first === -1) return true;

  if (counts[first] >= 3) {
    counts[first] -= 3;
    if (canFormMelds(counts, memo)) {
      counts[first] += 3;
      memo.set(key, true);
      return true;
    }
    counts[first] += 3;
  }

  const rank = first % 9;
  const isSuited = first < 27;
  if (
    isSuited &&
    rank <= 6 &&
    counts[first + 1] > 0 &&
    counts[first + 2] > 0
  ) {
    counts[first] -= 1;
    counts[first + 1] -= 1;
    counts[first + 2] -= 1;
    if (canFormMelds(counts, memo)) {
      counts[first] += 1;
      counts[first + 1] += 1;
      counts[first + 2] += 1;
      memo.set(key, true);
      return true;
    }
    counts[first] += 1;
    counts[first + 1] += 1;
    counts[first + 2] += 1;
  }

  memo.set(key, false);
  return false;
}

function isStandardHand(counts: number[]): boolean {
  for (let pairIndex = 0; pairIndex < counts.length; pairIndex += 1) {
    if (counts[pairIndex] < 2) continue;
    const remainder = [...counts];
    remainder[pairIndex] -= 2;
    if (canFormMelds(remainder, new Map())) return true;
  }
  return false;
}

function isSevenPairs(counts: number[]): boolean {
  return counts.filter((count) => count === 2).length === 7;
}

const ORPHAN_INDICES = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];

function isThirteenOrphans(counts: number[]): boolean {
  return (
    ORPHAN_INDICES.every((index) => counts[index] >= 1) &&
    ORPHAN_INDICES.some((index) => counts[index] >= 2) &&
    counts.every((count, index) => ORPHAN_INDICES.includes(index) || count === 0)
  );
}

export function winningPattern(
  tiles: Tile[],
  meldCount = 0,
): WinningPattern | null {
  if (meldCount < 0 || meldCount > 4) return null;
  if (tiles.length !== (4 - meldCount) * 3 + 2) return null;
  const counts = tileCounts(tiles);
  if (counts.some((count) => count > 4)) return null;
  if (meldCount === 0 && isThirteenOrphans(counts)) return "thirteen-orphans";
  if (meldCount === 0 && isSevenPairs(counts)) return "seven-pairs";
  if (isStandardHand(counts)) return "standard";
  return null;
}

export function isWinningHand(tiles: Tile[], meldCount = 0): boolean {
  return winningPattern(tiles, meldCount) !== null;
}

export function findWaits(tiles: Tile[], meldCount = 0): Tile[] {
  if (tiles.length !== (4 - meldCount) * 3 + 1) return [];
  const counts = tileCounts(tiles);
  const waits: Tile[] = [];
  for (let index = 0; index < 34; index += 1) {
    if (counts[index] >= 4) continue;
    const candidate = indexToTile(index);
    if (isWinningHand([...tiles, candidate], meldCount)) waits.push(candidate);
  }
  return sortTiles(waits);
}

export function findRiichiOptions(tiles: Tile[], meldCount = 0): RiichiOption[] {
  if (tiles.length !== (4 - meldCount) * 3 + 2) return [];
  return tiles.flatMap((discard, index) => {
    const remainder = tiles.filter((_, tileIndex) => tileIndex !== index);
    const waits = findWaits(remainder, meldCount);
    return waits.length > 0 ? [{ discardId: discard.id, waits }] : [];
  });
}
