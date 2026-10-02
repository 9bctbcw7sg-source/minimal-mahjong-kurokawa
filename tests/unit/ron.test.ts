import { describe, expect, it } from "vitest";
import { evaluateHand } from "../../src/game/scoring";
import {
  declareRon,
  discardTile,
  isPlayerFuriten,
  passRon,
} from "../../src/game/state";
import { createTileSet } from "../../src/game/tiles";
import type { GameState, PlayerState, Seat, Tile } from "../../src/game/types";

function takeTiles(codes: string[], pool = createTileSet()): Tile[] {
  const suitMap = { m: "man", p: "pin", s: "sou", h: "honor" } as const;
  return codes.map((code) => {
    const suit = suitMap[code[0] as keyof typeof suitMap];
    const rank = Number(code.slice(1));
    const index = pool.findIndex(
      (tile) => tile.suit === suit && tile.rank === rank,
    );
    if (index < 0) throw new Error(`牌が不足しています: ${code}`);
    return pool.splice(index, 1)[0];
  });
}

const WAITING_HAND = [
  "m1", "m2", "m3",
  "m4", "m5", "m6",
  "p2", "p3", "p4",
  "s6", "s7", "s8",
  "h1",
];

const LOOSE_HAND = [
  "m1", "m1", "m2", "m2", "m4", "m4", "p1",
  "p1", "p4", "p4", "s1", "s4", "h7",
];

function makePlayer(
  id: string,
  seat: Seat,
  hand: Tile[],
  options: Partial<PlayerState> = {},
): PlayerState {
  return {
    id,
    name: id === "you" ? "あなた" : `${seat}家`,
    seat,
    isHuman: id === "you",
    hand,
    drawnTile: null,
    discards: [],
    melds: [],
    mustDiscardAfterCall: false,
    forbiddenDiscardKeys: [],
    riichi: false,
    ippatsuEligible: false,
    riichiDiscardIndex: null,
    temporaryFuriten: false,
    points: 25_000,
    ...options,
  };
}

function ronGame(options: {
  humanRiichi?: boolean;
  humanDiscards?: Tile[];
} = {}): { game: GameState; winningTile: Tile } {
  const pool = createTileSet();
  const humanHand = takeTiles(WAITING_HAND, pool);
  const [winningTile] = takeTiles(["h1"], pool);
  const southHand = takeTiles(LOOSE_HAND, pool);
  const westHand = takeTiles(LOOSE_HAND, createTileSet());
  const northHand = takeTiles(LOOSE_HAND, createTileSet());
  const [wallTile] = takeTiles(["m9"], pool);

  return {
    winningTile,
    game: {
      phase: "playing",
      round: "東一局",
      roundWind: "東",
      handNumber: 1,
      dealerIndex: 0,
      wall: [wallTile],
      deadWall: [],
      rinshanTiles: [],
      doraIndicators: [],
      uraDoraIndicators: [],
      kanDoraIndicators: [],
      kanUraDoraIndicators: [],
      players: [
        makePlayer("you", "東", humanHand, {
          riichi: options.humanRiichi ?? true,
          discards: options.humanDiscards ?? [],
        }),
        makePlayer("south", "南", southHand, { drawnTile: winningTile }),
        makePlayer("west", "西", westHand),
        makePlayer("north", "北", northHand),
      ],
      currentPlayerIndex: 1,
      turnNumber: 8,
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
      matchType: "hanchan",
      bankruptcyEnabled: true,
      callsEnabled: true,
      rinshanPlayerIndex: null,
    },
  };
}

describe("基本役", () => {
  it("リーチ、タンヤオ、役牌を判定する", () => {
    const riichiTiles = takeTiles([...WAITING_HAND, "h1"]);
    expect(
      evaluateHand(riichiTiles, {
        winType: "ron",
        winningTile: riichiTiles.at(-1)!,
        playerSeat: "東",
        roundSeat: "東",
        riichi: true,
      })?.yaku.map((yaku) => yaku.name),
    ).toContain("リーチ");

    const tanyao = takeTiles([
      "m2", "m3", "m4", "m4", "m5", "m6", "p2",
      "p3", "p4", "s6", "s7", "s8", "p5", "p5",
    ]);
    expect(
      evaluateHand(tanyao, {
        winType: "ron",
        winningTile: tanyao.at(-1)!,
        playerSeat: "南",
        roundSeat: "東",
        riichi: false,
      })?.yaku.map((yaku) => yaku.name),
    ).toContain("断么九");

    const yakuhai = takeTiles([
      "m1", "m2", "m3", "p1", "p2", "p3", "s1",
      "s2", "s3", "h7", "h7", "h7", "h1", "h1",
    ]);
    expect(
      evaluateHand(yakuhai, {
        winType: "ron",
        winningTile: yakuhai.at(-1)!,
        playerSeat: "南",
        roundSeat: "東",
        riichi: false,
      })?.yaku.map((yaku) => yaku.name),
    ).toContain("役牌 中");
  });

  it("和了形でも役がなければロンできない", () => {
    const tiles = takeTiles([...WAITING_HAND, "h1"]);
    expect(
      evaluateHand(tiles, {
        winType: "ron",
        winningTile: tiles.at(-1)!,
        playerSeat: "南",
        roundSeat: "東",
        riichi: false,
      }),
    ).toBeNull();
  });
});

describe("ロンとフリテン", () => {
  it("相手の打牌でリーチロンし、放銃者と和了牌を記録する", () => {
    const { game, winningTile } = ronGame();
    const reaction = discardTile(game, winningTile.id);

    expect(reaction.phase).toBe("reaction");
    expect(reaction.pendingDiscard?.ronCandidateIndices).toEqual([0]);

    const won = declareRon(reaction, 0);
    expect(won.phase).toBe("won");
    expect(won.winType).toBe("ron");
    expect(won.winnerIndex).toBe(0);
    expect(won.loserIndex).toBe(1);
    expect(won.winningTile?.id).toBe(winningTile.id);
    expect(won.winningYaku).toContain("リーチ");
    expect(won.scoreResult?.totalPoints).toBeGreaterThan(0);
    expect(won.players[0].points).toBeGreaterThan(25_000);
    expect(won.players[1].points).toBeLessThan(25_000);
  });

  it("ロンを見送ると一時フリテンになり、次の手番へ進む", () => {
    const { game, winningTile } = ronGame();
    const reaction = discardTile(game, winningTile.id);
    const passed = passRon(reaction, 0);

    expect(passed.phase).toBe("playing");
    expect(passed.currentPlayerIndex).toBe(2);
    expect(passed.players[0].temporaryFuriten).toBe(true);
  });

  it("自分の河に待ち牌がある場合は捨牌フリテンになる", () => {
    const pool = createTileSet();
    const humanHand = takeTiles(WAITING_HAND, pool);
    const [discardedWait] = takeTiles(["h1"], pool);
    const player = makePlayer("you", "東", humanHand, {
      riichi: true,
      discards: [discardedWait],
    });

    expect(isPlayerFuriten(player)).toBe(true);
  });

  it("役なし和了形にはロン確認を出さない", () => {
    const { game, winningTile } = ronGame({ humanRiichi: false });
    const afterDiscard = discardTile(game, winningTile.id);

    expect(afterDiscard.phase).toBe("playing");
    expect(afterDiscard.currentPlayerIndex).toBe(2);
  });
});
