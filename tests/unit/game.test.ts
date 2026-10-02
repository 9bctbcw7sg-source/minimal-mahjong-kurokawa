import { describe, expect, it } from "vitest";
import { playAiTurn } from "../../src/game/ai";
import { createInitialGame, discardTile } from "../../src/game/state";
import {
  compareTiles,
  createTileSet,
  sortTiles,
  tileTypeKey,
} from "../../src/game/tiles";
import type { Tile } from "../../src/game/types";

function deterministicRandom(): number {
  return 0.314159;
}

describe("牌セット", () => {
  it("136枚を生成し、全34種が4枚ずつある", () => {
    const tiles = createTileSet();
    const counts = new Map<string, number>();
    for (const tile of tiles) {
      const key = tileTypeKey(tile);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    expect(tiles).toHaveLength(136);
    expect(new Set(tiles.map((tile) => tile.id)).size).toBe(136);
    expect(counts.size).toBe(34);
    expect([...counts.values()]).toEqual(Array(34).fill(4));
  });
});

describe("自動整列", () => {
  it("萬子、筒子、索子、字牌の順に整列する", () => {
    const tiles: Tile[] = [
      { id: "h", suit: "honor", rank: 1, copy: 0 },
      { id: "s", suit: "sou", rank: 9, copy: 0 },
      { id: "m9", suit: "man", rank: 9, copy: 0 },
      { id: "p", suit: "pin", rank: 2, copy: 0 },
      { id: "m1", suit: "man", rank: 1, copy: 0 },
    ];

    expect(sortTiles(tiles).map((tile) => tile.id)).toEqual([
      "m1",
      "m9",
      "p",
      "s",
      "h",
    ]);
    expect(sortTiles(tiles).every((tile, index, sorted) =>
      index === 0 || compareTiles(sorted[index - 1], tile) <= 0,
    )).toBe(true);
  });
});

describe("配牌と手番", () => {
  it("4人へ13枚ずつ配り、東家だけが最初のツモ牌を持つ", () => {
    const game = createInitialGame(deterministicRandom);

    expect(game.players.map((player) => player.hand.length)).toEqual([13, 13, 13, 13]);
    expect(game.players.map((player) => Boolean(player.drawnTile))).toEqual([true, false, false, false]);
    expect(game.players.map((player) => player.points)).toEqual([
      25_000,
      25_000,
      25_000,
      25_000,
    ]);
    expect([game.honba, game.riichiSticks]).toEqual([0, 0]);
    expect(game.wall).toHaveLength(69);
    expect(game.deadWall).toHaveLength(14);
    expect(game.doraIndicators).toHaveLength(1);
    expect(game.uraDoraIndicators).toHaveLength(1);
  });

  it("ツモ切り後は13枚を保ち、河へ1枚置いて次家がツモる", () => {
    const game = createInitialGame(deterministicRandom);
    const drawnId = game.players[0].drawnTile?.id;
    expect(drawnId).toBeTruthy();

    const afterDiscard = discardTile(game, drawnId!);

    expect(afterDiscard.players[0].hand).toHaveLength(13);
    expect(afterDiscard.players[0].drawnTile).toBeNull();
    expect(afterDiscard.players[0].discards).toHaveLength(1);
    expect(afterDiscard.players[1].hand).toHaveLength(13);
    expect(afterDiscard.players[1].drawnTile).not.toBeNull();
    expect(afterDiscard.wall).toHaveLength(68);
  });

  it("手牌から捨てるとツモ牌が整列済み手牌へ入り、枚数を保つ", () => {
    const game = createInitialGame(deterministicRandom);
    const discardId = game.players[0].hand[0].id;

    const afterDiscard = discardTile(game, discardId);

    expect(afterDiscard.players[0].hand).toHaveLength(13);
    expect(afterDiscard.players[0].discards[0].id).toBe(discardId);
    expect(afterDiscard.players[0].hand.every((tile, index, hand) =>
      index === 0 || compareTiles(hand[index - 1], tile) <= 0,
    )).toBe(true);
  });

  it("簡易AIが合法な1枚を捨てて次の手番へ進める", () => {
    const game = createInitialGame(deterministicRandom);
    const southTurn = discardTile(game, game.players[0].drawnTile!.id);
    const beforeIds = new Set([
      ...southTurn.players[1].hand,
      southTurn.players[1].drawnTile!,
    ].map((tile) => tile.id));

    const westTurn = playAiTurn(southTurn, deterministicRandom);

    expect(westTurn.currentPlayerIndex).toBe(2);
    expect(westTurn.players[1].discards).toHaveLength(1);
    expect(beforeIds.has(westTurn.players[1].discards[0].id)).toBe(true);
    expect(westTurn.players[1].hand).toHaveLength(13);
    expect(westTurn.players[2].drawnTile).not.toBeNull();
  });
});
