import { describe, expect, it } from "vitest";
import {
  advanceToNextHand,
  createInitialGame,
  discardTile,
  getMatchEndReason,
  isHanchanComplete,
  isMatchComplete,
} from "../../src/game/state";
import { createTileSet } from "../../src/game/tiles";
import type { GameState, Tile } from "../../src/game/types";

function deterministicRandom(): number {
  return 0.271828;
}

function asWon(
  game: GameState,
  winnerIndex: number,
  options: Partial<GameState> = {},
): GameState {
  return {
    ...game,
    phase: "won",
    winnerIndex,
    winType: "ron",
    winningTile: game.players[0].drawnTile,
    ...options,
  };
}

function asDraw(
  game: GameState,
  tenpaiIndices: number[],
  options: Partial<GameState> = {},
): GameState {
  return {
    ...game,
    phase: "exhausted",
    drawResult: {
      tenpaiIndices,
      payments: Array(game.players.length).fill(0),
    },
    ...options,
  };
}

function tilesFromCodes(codes: string[]): Tile[] {
  const suitMap = { m: "man", p: "pin", s: "sou", h: "honor" } as const;
  const pool = createTileSet();
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
  "m1", "m2", "m3", "m4", "m5", "m6", "p2",
  "p3", "p4", "s6", "s7", "s8", "h1",
];

const NOTEN_HAND = [
  "m1", "m1", "m3", "m5", "m7", "m9", "p1",
  "p3", "p5", "p7", "s1", "s4", "h7",
];

describe("次局進行", () => {
  it("親の和了は点数を保って同じ局の1本場へ進む", () => {
    const game = createInitialGame(deterministicRandom);
    game.players[0].points = 30_900;
    const next = advanceToNextHand(asWon(game, 0), deterministicRandom);

    expect([next.round, next.honba, next.dealerIndex]).toEqual([
      "東一局",
      1,
      0,
    ]);
    expect(next.players[0].points).toBe(30_900);
    expect(next.players.map((player) => player.seat)).toEqual([
      "東",
      "南",
      "西",
      "北",
    ]);
    expect(next.players.every((player) => player.discards.length === 0)).toBe(true);
    expect(next.wall).toHaveLength(69);
    expect(next.deadWall).toHaveLength(14);
  });

  it("子の和了は親を交代して次局0本場へ進む", () => {
    const game = createInitialGame(deterministicRandom);
    const next = advanceToNextHand(asWon(game, 1), deterministicRandom);

    expect([next.round, next.honba, next.dealerIndex, next.currentPlayerIndex]).toEqual([
      "東二局",
      0,
      1,
      1,
    ]);
    expect(next.players.map((player) => player.seat)).toEqual([
      "北",
      "東",
      "南",
      "西",
    ]);
    expect(next.players.map((player) => player.name)).toEqual([
      "あなた",
      "東家",
      "南家",
      "西家",
    ]);
  });

  it("流局は本場と供託を引き継ぎ、親テンパイなら連荘する", () => {
    const game = createInitialGame(deterministicRandom);
    game.riichiSticks = 2;
    const next = advanceToNextHand(
      asDraw(game, [0, 2]),
      deterministicRandom,
    );

    expect([next.round, next.honba, next.dealerIndex, next.riichiSticks]).toEqual([
      "東一局",
      1,
      0,
      2,
    ]);
  });

  it("親ノーテンの流局は1本場のまま次局へ進む", () => {
    const game = createInitialGame(deterministicRandom);
    const next = advanceToNextHand(asDraw(game, [1]), deterministicRandom);

    expect([next.round, next.honba, next.dealerIndex]).toEqual([
      "東二局",
      1,
      1,
    ]);
  });

  it("東四局の親交代後は南一局へ進む", () => {
    const game = createInitialGame(deterministicRandom);
    const eastFour = asWon(game, 0, {
      round: "東四局",
      roundWind: "東",
      handNumber: 4,
      dealerIndex: 3,
    });
    const next = advanceToNextHand(eastFour, deterministicRandom);

    expect([next.round, next.roundWind, next.handNumber, next.dealerIndex]).toEqual([
      "南一局",
      "南",
      1,
      0,
    ]);
  });

  it("南四局で親が流れれば半荘終了、親和了なら連荘する", () => {
    const game = createInitialGame(deterministicRandom);
    const southFour = {
      round: "南四局",
      roundWind: "南" as const,
      handNumber: 4 as const,
      dealerIndex: 3,
    };
    const childWin = asWon(game, 0, southFour);
    const dealerWin = asWon(game, 3, southFour);

    expect(isHanchanComplete(childWin)).toBe(true);
    expect(isHanchanComplete(dealerWin)).toBe(false);
    expect(advanceToNextHand(dealerWin, deterministicRandom).round).toBe("南四局");
  });

  it("親流れを繰り返すと東一局から南四局まで8局進行する", () => {
    let game = createInitialGame(deterministicRandom);
    const rounds: string[] = [];

    for (let hand = 0; hand < 8; hand += 1) {
      rounds.push(game.round);
      const childWinner = (game.dealerIndex + 1) % game.players.length;
      game = asWon(game, childWinner);
      if (hand < 7) game = advanceToNextHand(game, deterministicRandom);
    }

    expect(rounds).toEqual([
      "東一局",
      "東二局",
      "東三局",
      "東四局",
      "南一局",
      "南二局",
      "南三局",
      "南四局",
    ]);
    expect(isHanchanComplete(game)).toBe(true);
  });

  it("一荘戦は南四局で終わらず、西場と北場まで16局進行する", () => {
    let game = createInitialGame(deterministicRandom, true, {
      matchType: "full",
      bankruptcyEnabled: false,
    });
    const rounds: string[] = [];

    for (let hand = 0; hand < 16; hand += 1) {
      rounds.push(game.round);
      const childWinner = (game.dealerIndex + 1) % game.players.length;
      game = asWon(game, childWinner);
      if (hand < 15) game = advanceToNextHand(game, deterministicRandom);
    }

    expect(rounds).toEqual([
      "東一局", "東二局", "東三局", "東四局",
      "南一局", "南二局", "南三局", "南四局",
      "西一局", "西二局", "西三局", "西四局",
      "北一局", "北二局", "北三局", "北四局",
    ]);
    expect(isMatchComplete(game)).toBe(true);
    expect(getMatchEndReason(game)).toBe("scheduled");
  });

  it("一荘戦では南四局の親流れ後に西一局へ進む", () => {
    const game = createInitialGame(deterministicRandom, true, {
      matchType: "full",
    });
    const southFour = asWon(game, 0, {
      round: "南四局",
      roundWind: "南",
      handNumber: 4,
      dealerIndex: 3,
    });

    expect(isMatchComplete(southFour)).toBe(false);
    const next = advanceToNextHand(southFour, deterministicRandom);
    expect([next.round, next.roundWind, next.handNumber]).toEqual([
      "西一局",
      "西",
      1,
    ]);
  });

  it("箱割れありは持ち点がマイナスになった局で即終了する", () => {
    const game = createInitialGame(deterministicRandom, true, {
      matchType: "full",
      bankruptcyEnabled: true,
    });
    const ended = asWon(game, 1);
    ended.players[0].points = -100;

    expect(isMatchComplete(ended)).toBe(true);
    expect(getMatchEndReason(ended)).toBe("bankruptcy");
    expect(advanceToNextHand(ended, deterministicRandom)).toBe(ended);
  });

  it("箱割れなしはマイナス持ち点でも規定局まで続行する", () => {
    const game = createInitialGame(deterministicRandom, true, {
      matchType: "full",
      bankruptcyEnabled: false,
    });
    const ended = asWon(game, 1);
    ended.players[0].points = -100;

    expect(isMatchComplete(ended)).toBe(false);
    expect(getMatchEndReason(ended)).toBeNull();
    expect(advanceToNextHand(ended, deterministicRandom).round).toBe("東二局");
  });

  it("0点は箱割れとせず、マイナスになった場合だけ終了する", () => {
    const game = createInitialGame(deterministicRandom, true, {
      bankruptcyEnabled: true,
    });
    const ended = asWon(game, 1);
    ended.players[0].points = 0;

    expect(isMatchComplete(ended)).toBe(false);
  });
});

describe("流局精算", () => {
  it("1人テンパイならノーテン三家から1000点ずつ受け取る", () => {
    const game = createInitialGame(deterministicRandom);
    game.wall = [];
    game.currentPlayerIndex = 0;
    game.players.forEach((player, index) => {
      player.hand = tilesFromCodes(index === 0 ? WAITING_HAND : NOTEN_HAND);
      player.drawnTile = null;
      player.points = 25_000;
    });
    const [discard] = tilesFromCodes(["m9"]);
    game.players[0].drawnTile = discard;

    const exhausted = discardTile(game, discard.id);

    expect(exhausted.phase).toBe("exhausted");
    expect(exhausted.drawResult?.tenpaiIndices).toEqual([0]);
    expect(exhausted.drawResult?.payments).toEqual([
      3_000,
      -1_000,
      -1_000,
      -1_000,
    ]);
    expect(exhausted.players.map((player) => player.points)).toEqual([
      28_000,
      24_000,
      24_000,
      24_000,
    ]);
  });
});
