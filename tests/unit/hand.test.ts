import { describe, expect, it } from "vitest";
import {
  findRiichiOptions,
  findWaits,
  isWinningHand,
  winningPattern,
} from "../../src/game/hand";
import { declareTsumo, discardTile } from "../../src/game/state";
import { createTileSet, tileTypeKey } from "../../src/game/tiles";
import type { Tile } from "../../src/game/types";

function tilesFromCodes(codes: string[]): Tile[] {
  const suitMap = { m: "man", p: "pin", s: "sou", h: "honor" } as const;
  const pool = createTileSet();
  return codes.map((code) => {
    const suit = suitMap[code[0] as keyof typeof suitMap];
    const rank = Number(code.slice(1));
    const index = pool.findIndex((tile) => tile.suit === suit && tile.rank === rank);
    if (index < 0) throw new Error(`牌が不足しています: ${code}`);
    return pool.splice(index, 1)[0];
  });
}

const STANDARD_WIN = [
  "m1", "m2", "m3",
  "p1", "p2", "p3",
  "s1", "s2", "s3",
  "s7", "s8", "s9",
  "h1", "h1",
];

describe("和了形判定", () => {
  it("4面子1雀頭の標準形を判定する", () => {
    const tiles = tilesFromCodes(STANDARD_WIN);
    expect(isWinningHand(tiles)).toBe(true);
    expect(winningPattern(tiles)).toBe("standard");
  });

  it("七対子を判定する", () => {
    const tiles = tilesFromCodes([
      "m1", "m1", "m2", "m2", "p3", "p3", "p4", "p4",
      "s5", "s5", "s6", "s6", "h7", "h7",
    ]);
    expect(winningPattern(tiles)).toBe("seven-pairs");
  });

  it("国士無双を判定する", () => {
    const tiles = tilesFromCodes([
      "m1", "m9", "p1", "p9", "s1", "s9",
      "h1", "h2", "h3", "h4", "h5", "h6", "h7", "m1",
    ]);
    expect(winningPattern(tiles)).toBe("thirteen-orphans");
  });
});

describe("テンパイとリーチ", () => {
  it("単騎待ちを34種から検出する", () => {
    const hand = tilesFromCodes(STANDARD_WIN.slice(0, 13));
    const waits = findWaits(hand);
    expect(waits.map(tileTypeKey)).toEqual(["honor-1"]);
  });

  it("14枚からリーチ可能な打牌と待ちを求める", () => {
    const tiles = tilesFromCodes([...STANDARD_WIN.slice(0, 13), "h2"]);
    const north = tiles.find((tile) => tile.suit === "honor" && tile.rank === 2)!;
    const option = findRiichiOptions(tiles).find(
      (candidate) => candidate.discardId === north.id,
    );
    expect(option?.waits.map(tileTypeKey)).toEqual(["honor-1"]);
  });

  it("和了形のツモを宣言すると局を終了する", () => {
    const tiles = tilesFromCodes(STANDARD_WIN);
    const game = {
      phase: "playing" as const,
      round: "東一局" as const,
      roundWind: "東" as const,
      handNumber: 1 as const,
      dealerIndex: 0,
      wall: [],
      deadWall: [],
      rinshanTiles: [],
      doraIndicators: [],
      uraDoraIndicators: [],
      kanDoraIndicators: [],
      kanUraDoraIndicators: [],
      currentPlayerIndex: 0,
      turnNumber: 1,
      honba: 0,
      riichiSticks: 0,
      pendingDiscard: null,
      winnerIndex: null,
      loserIndex: null,
      winType: null,
      winningTile: null,
      winningYaku: [],
      scoreResult: null,
      drawResult: null,
      matchType: "hanchan" as const,
      bankruptcyEnabled: true,
      callsEnabled: true,
      rinshanPlayerIndex: null,
      players: [
        {
          id: "you",
          name: "あなた",
          seat: "東" as const,
          isHuman: true,
          hand: tiles.slice(0, 13),
          drawnTile: tiles[13],
          discards: [],
          melds: [],
          mustDiscardAfterCall: false,
          forbiddenDiscardKeys: [],
          riichi: false,
          ippatsuEligible: false,
          riichiDiscardIndex: null,
          temporaryFuriten: false,
          points: 25_000,
        },
      ],
    };

    const won = declareTsumo(game);
    expect(won.phase).toBe("won");
    expect(won.winnerIndex).toBe(0);
    expect(won.winType).toBe("tsumo");
  });

  it("合法な打牌でリーチを宣言し、宣言牌を記録する", () => {
    const tiles = tilesFromCodes([...STANDARD_WIN.slice(0, 13), "h2"]);
    const north = tiles[13];
    const game = {
      phase: "playing" as const,
      round: "東一局" as const,
      roundWind: "東" as const,
      handNumber: 1 as const,
      dealerIndex: 0,
      wall: tilesFromCodes(["m9"]),
      deadWall: [],
      rinshanTiles: [],
      doraIndicators: [],
      uraDoraIndicators: [],
      kanDoraIndicators: [],
      kanUraDoraIndicators: [],
      currentPlayerIndex: 0,
      turnNumber: 1,
      honba: 0,
      riichiSticks: 0,
      pendingDiscard: null,
      winnerIndex: null,
      loserIndex: null,
      winType: null,
      winningTile: null,
      winningYaku: [],
      scoreResult: null,
      drawResult: null,
      matchType: "hanchan" as const,
      bankruptcyEnabled: true,
      callsEnabled: true,
      rinshanPlayerIndex: null,
      players: [
        {
          id: "you",
          name: "あなた",
          seat: "東" as const,
          isHuman: true,
          hand: tiles.slice(0, 13),
          drawnTile: north,
          discards: [],
          melds: [],
          mustDiscardAfterCall: false,
          forbiddenDiscardKeys: [],
          riichi: false,
          ippatsuEligible: false,
          riichiDiscardIndex: null,
          temporaryFuriten: false,
          points: 25_000,
        },
      ],
    };

    const afterRiichi = discardTile(game, north.id, true);
    expect(afterRiichi.players[0].riichi).toBe(true);
    expect(afterRiichi.players[0].ippatsuEligible).toBe(true);
    expect(afterRiichi.players[0].discards[0].id).toBe(north.id);
    expect(afterRiichi.players[0].riichiDiscardIndex).toBe(0);
    expect(afterRiichi.players[0].points).toBe(24_000);
    expect(afterRiichi.riichiSticks).toBe(1);
  });
});
