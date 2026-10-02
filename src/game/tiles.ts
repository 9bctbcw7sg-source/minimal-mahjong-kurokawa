import type { Suit, Tile } from "./types";

export const SUIT_ORDER: Record<Suit, number> = {
  man: 0,
  pin: 1,
  sou: 2,
  honor: 3,
};

const HONOR_NAMES = ["東", "南", "西", "北", "白", "發", "中"];
const SUIT_NAMES: Record<Exclude<Suit, "honor">, string> = {
  man: "萬",
  pin: "筒",
  sou: "索",
};

export function createTileSet(): Tile[] {
  const tiles: Tile[] = [];
  const suited: Suit[] = ["man", "pin", "sou"];

  for (const suit of suited) {
    for (let rank = 1; rank <= 9; rank += 1) {
      for (let copy = 0; copy < 4; copy += 1) {
        tiles.push({ id: `${suit}-${rank}-${copy}`, suit, rank, copy });
      }
    }
  }

  for (let rank = 1; rank <= 7; rank += 1) {
    for (let copy = 0; copy < 4; copy += 1) {
      tiles.push({ id: `honor-${rank}-${copy}`, suit: "honor", rank, copy });
    }
  }

  return tiles;
}

export function tileTypeKey(tile: Tile): string {
  return `${tile.suit}-${tile.rank}`;
}

export function compareTiles(a: Tile, b: Tile): number {
  return (
    SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit] ||
    a.rank - b.rank ||
    a.copy - b.copy
  );
}

export function sortTiles(tiles: Tile[]): Tile[] {
  return [...tiles].sort(compareTiles);
}

export function tileLabel(tile: Tile): string {
  if (tile.suit === "honor") return HONOR_NAMES[tile.rank - 1];
  return `${tile.rank}${SUIT_NAMES[tile.suit]}`;
}

export function tileFace(tile: Tile): { main: string; sub: string } {
  if (tile.suit === "honor") {
    return { main: HONOR_NAMES[tile.rank - 1], sub: "" };
  }
  return { main: String(tile.rank), sub: SUIT_NAMES[tile.suit] };
}
