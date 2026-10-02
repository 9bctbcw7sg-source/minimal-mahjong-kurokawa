import { describe, expect, it } from "vitest";
import { chooseAiCallOption } from "../../src/game/ai";
import { findWaits } from "../../src/game/hand";
import { evaluateHand } from "../../src/game/scoring";
import {
  createInitialGame,
  currentCallOptions,
  declareCall,
  declareKan,
  declareRon,
  discardTile,
  findCallOptions,
  findKanOptions,
  passCall,
} from "../../src/game/state";
import { createTileSet, tileTypeKey } from "../../src/game/tiles";
import type { Meld, PlayerState, Tile } from "../../src/game/types";

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

function playerWithHand(player: PlayerState, codes: string[]): PlayerState {
  return {
    ...player,
    hand: takeTiles(codes),
    drawnTile: null,
    discards: [],
    melds: [],
    riichi: false,
    mustDiscardAfterCall: false,
    forbiddenDiscardKeys: [],
  };
}

const LOOSE = [
  "m1", "m4", "m7", "p1", "p4", "p7", "s1",
  "s4", "s7", "h1", "h3", "h5", "h7",
];

function setKanWall(game: ReturnType<typeof createInitialGame>, pool: Tile[]) {
  const deadWall = pool.splice(0, 14);
  game.deadWall = deadWall;
  game.rinshanTiles = deadWall.slice(0, 4);
  game.doraIndicators = [deadWall[4]];
  game.uraDoraIndicators = [deadWall[5]];
  game.kanDoraIndicators = [deadWall[6], deadWall[8], deadWall[10], deadWall[12]];
  game.kanUraDoraIndicators = [deadWall[7], deadWall[9], deadWall[11], deadWall[13]];
  game.wall = pool;
}

describe("チー・ポン", () => {
  it("ポンをチーより優先し、チーは下家だけに提示する", () => {
    const game = createInitialGame(() => 0.5, true);
    const [discard] = takeTiles(["m3"]);
    const players = [
      playerWithHand(game.players[0], LOOSE),
      playerWithHand(game.players[1], ["m1", "m2", ...LOOSE.slice(2)]),
      playerWithHand(game.players[2], ["m3", "m3", ...LOOSE.slice(2)]),
      playerWithHand(game.players[3], ["m1", "m2", ...LOOSE.slice(2)]),
    ];

    const options = findCallOptions(players, 0, discard, true);
    expect(options[0]).toMatchObject({ type: "pon", playerIndex: 2 });
    expect(options.some((option) => option.type === "chi" && option.playerIndex === 1)).toBe(true);
    expect(options.some((option) => option.type === "chi" && option.playerIndex === 3)).toBe(false);
    expect(findCallOptions(players, 0, discard, false)).toEqual([]);
  });

  it("先のポン見送り後にチーし、副露と食い替え禁止を適用する", () => {
    const game = createInitialGame(() => 0.5, true);
    const [discard] = takeTiles(["m1"]);
    game.players = [
      playerWithHand(game.players[0], LOOSE),
      playerWithHand(game.players[1], ["m2", "m3", "m4", ...LOOSE.slice(3)]),
      playerWithHand(game.players[2], ["m1", "m1", ...LOOSE.slice(2)]),
      playerWithHand(game.players[3], LOOSE),
    ];
    game.players[0].drawnTile = discard;
    game.players[3].ippatsuEligible = true;
    game.currentPlayerIndex = 0;
    game.wall = takeTiles(["p9", "s9"]);

    const reaction = discardTile(game, discard.id);
    expect(currentCallOptions(reaction)[0]).toMatchObject({
      type: "pon",
      playerIndex: 2,
    });

    const afterPonPass = passCall(reaction, 2);
    const chi = currentCallOptions(afterPonPass).find(
      (option) => option.type === "chi" && option.sequenceStart === 1,
    );
    expect(chi).toBeDefined();

    const called = declareCall(afterPonPass, chi!.id);
    expect(called.phase).toBe("playing");
    expect(called.currentPlayerIndex).toBe(1);
    expect(called.players[1].melds).toHaveLength(1);
    expect(called.players[1].hand).toHaveLength(11);
    expect(called.players[1].mustDiscardAfterCall).toBe(true);
    expect(called.players[0].discards).toHaveLength(0);
    expect(called.players.every((player) => !player.ippatsuEligible)).toBe(true);

    const fourMan = called.players[1].hand.find(
      (tile) => tile.suit === "man" && tile.rank === 4,
    )!;
    expect(called.players[1].forbiddenDiscardKeys).toContain("man-4");
    expect(discardTile(called, fourMan.id)).toBe(called);

    const legal = called.players[1].hand.find(
      (tile) => !called.players[1].forbiddenDiscardKeys.includes(tileTypeKey(tile)),
    )!;
    const afterCallDiscard = discardTile(called, legal.id);
    expect(afterCallDiscard.players[1].mustDiscardAfterCall).toBe(false);
    expect(afterCallDiscard.players[1].hand).toHaveLength(10);
  });

  it("簡易AIは役牌を大明槓できる場合はカンを優先する", () => {
    const game = createInitialGame(() => 0.5, true);
    const [discard] = takeTiles(["h7"]);
    game.players[1] = playerWithHand(game.players[1], ["h7", "h7", ...LOOSE.slice(2)]);
    game.phase = "reaction";
    game.pendingDiscard = {
      tile: discard,
      playerIndex: 0,
      ronCandidateIndices: [],
      callOptions: findCallOptions(game.players, 0, discard, true),
    };
    expect(chooseAiCallOption(game, () => 0.99)).toMatchObject({
      type: "kan-open",
      playerIndex: 1,
    });
  });
});

describe("副露した手の和了と点数", () => {
  it("副露数を考慮して待ち牌を判定する", () => {
    const concealed = takeTiles([
      "p2", "p3", "p4", "s6", "s7", "s8", "h7", "h7", "h7", "m5",
    ]);
    expect(findWaits(concealed, 1).map(tileTypeKey)).toContain("man-5");
  });

  it("食いタンを1翻として扱い、門前ツモを付けない", () => {
    const meldTiles = takeTiles(["m2", "m3", "m4"]);
    const meld: Meld = {
      id: "chi-234m",
      type: "chi",
      tiles: meldTiles,
      calledTileId: meldTiles[0].id,
      fromPlayerIndex: 0,
    };
    const concealed = takeTiles([
      "p2", "p3", "p4", "s4", "s5", "s6", "s6", "s7", "s8", "m5", "m5",
    ]);
    const value = evaluateHand(concealed, {
      winType: "tsumo",
      winningTile: concealed.at(-1)!,
      playerSeat: "南",
      roundSeat: "東",
      riichi: false,
      melds: [meld],
    });
    expect(value?.yaku).toContainEqual({ name: "断么九", han: 1 });
    expect(value?.yaku.map((yaku) => yaku.name)).not.toContain("門前清自摸和");
  });

  it("副露した混一色を2翻に下げる", () => {
    const meldTiles = takeTiles(["m1", "m2", "m3"]);
    const meld: Meld = {
      id: "chi-123m",
      type: "chi",
      tiles: meldTiles,
      calledTileId: meldTiles[0].id,
      fromPlayerIndex: 0,
    };
    const concealed = takeTiles([
      "m4", "m5", "m6", "m7", "m8", "m9", "h7", "h7", "h7", "h1", "h1",
    ]);
    const value = evaluateHand(concealed, {
      winType: "ron",
      winningTile: concealed.at(-1)!,
      playerSeat: "南",
      roundSeat: "東",
      riichi: false,
      melds: [meld],
    });
    expect(value?.yaku).toContainEqual({ name: "混一色", han: 2 });
  });
});

describe("カン", () => {
  it("暗槓後に嶺上牌を引き、新しいドラ表示牌を開く", () => {
    const game = createInitialGame(() => 0.5, true);
    const pool = createTileSet();
    game.players[0].hand = takeTiles([
      "m5", "m5", "m5", "m1", "m2", "m3", "p1", "p2", "p3", "s1", "s2", "s3", "h1",
    ], pool);
    game.players[0].drawnTile = takeTiles(["m5"], pool)[0];
    setKanWall(game, pool);
    const wallCount = game.wall.length;
    const option = findKanOptions(game, 0).find((candidate) => candidate.type === "kan-closed");
    expect(option).toBeDefined();

    const after = declareKan(game, option!.id);
    expect(after.players[0].melds[0]).toMatchObject({ type: "kan-closed" });
    expect(after.players[0].melds[0].tiles).toHaveLength(4);
    expect(after.players[0].drawnTile).not.toBeNull();
    expect(after.wall).toHaveLength(wallCount - 1);
    expect(after.deadWall).toHaveLength(14);
    expect(after.rinshanTiles).toHaveLength(3);
    expect(after.doraIndicators).toHaveLength(2);
    expect(after.rinshanPlayerIndex).toBe(0);
  });

  it("捨て牌を大明槓すると河から取り込み嶺上牌を引く", () => {
    const game = createInitialGame(() => 0.5, true);
    const pool = createTileSet();
    const [discard] = takeTiles(["h7"], pool);
    game.players[0] = {
      ...playerWithHand(game.players[0], []),
      hand: takeTiles([
        "m1", "m4", "m7", "p1", "p4", "p7", "p9", "s1", "s4", "s7", "h1", "h3", "h5",
      ], pool),
    };
    game.players[0].drawnTile = discard;
    game.players[1] = {
      ...playerWithHand(game.players[1], []),
      hand: takeTiles(["h7", "h7", "h7", ...LOOSE.slice(3, -1), "m8"], pool),
    };
    setKanWall(game, pool);
    const reaction = discardTile(game, discard.id);
    const option = currentCallOptions(reaction).find(
      (candidate) => candidate.type === "kan-open" && candidate.playerIndex === 1,
    );
    expect(option).toBeDefined();

    const after = declareCall(reaction, option!.id);
    expect(after.players[1].melds[0]).toMatchObject({ type: "kan-open" });
    expect(after.players[1].melds[0].tiles).toHaveLength(4);
    expect(after.players[1].drawnTile).not.toBeNull();
    expect(after.players[0].discards).toHaveLength(0);
    expect(after.doraIndicators).toHaveLength(2);
  });

  it("ポンに4枚目を加槓し、元のツモ牌を手牌へ収めて嶺上牌を引く", () => {
    const game = createInitialGame(() => 0.5, true);
    const pool = createTileSet();
    const ponTiles = takeTiles(["h6", "h6", "h6"], pool);
    game.players[0].melds = [{
      id: "pon-green",
      type: "pon",
      tiles: ponTiles,
      calledTileId: ponTiles[0].id,
      fromPlayerIndex: 3,
    }];
    game.players[0].hand = takeTiles([
      "h6", "m1", "m2", "m3", "p1", "p2", "p3", "s1", "s2", "s3",
    ], pool);
    game.players[0].drawnTile = takeTiles(["p9"], pool)[0];
    game.players.slice(1).forEach((player) => {
      player.hand = takeTiles(LOOSE);
      player.drawnTile = null;
    });
    setKanWall(game, pool);
    const option = findKanOptions(game, 0).find((candidate) => candidate.type === "kan-added");
    expect(option).toBeDefined();

    const after = declareKan(game, option!.id);
    expect(after.phase).toBe("playing");
    expect(after.players[0].melds[0]).toMatchObject({ type: "kan-added" });
    expect(after.players[0].melds[0].tiles).toHaveLength(4);
    expect(after.players[0].hand.some((tile) => tile.suit === "pin" && tile.rank === 9)).toBe(true);
    expect(after.players[0].drawnTile).not.toBeNull();
    expect(after.doraIndicators).toHaveLength(2);
  });

  it("加槓牌をロンすると槍槓で和了し、新ドラは開かない", () => {
    const game = createInitialGame(() => 0.5, true);
    const pool = createTileSet();
    const ponTiles = takeTiles(["m3", "m3", "m3"], pool);
    game.players[0].melds = [{
      id: "pon-three-man",
      type: "pon",
      tiles: ponTiles,
      calledTileId: ponTiles[0].id,
      fromPlayerIndex: 3,
    }];
    game.players[0].hand = takeTiles([
      "m3", "m4", "m5", "m6", "p4", "p5", "p6", "s4", "s5", "s6",
    ], pool);
    game.players[0].drawnTile = takeTiles(["p9"], pool)[0];
    game.players[1].hand = takeTiles([
      "m1", "m2", "p1", "p2", "p3", "p5", "p5", "p5", "s1", "s2", "s3", "h1", "h1",
    ], pool);
    game.players[1].drawnTile = null;
    game.players[1].riichi = true;
    game.players[2] = playerWithHand(game.players[2], LOOSE);
    game.players[3] = playerWithHand(game.players[3], LOOSE);
    setKanWall(game, pool);
    const option = findKanOptions(game, 0).find((candidate) => candidate.type === "kan-added");
    const reaction = declareKan(game, option!.id);

    expect(reaction.phase).toBe("reaction");
    expect(reaction.pendingDiscard).toMatchObject({
      source: "added-kan",
      ronCandidateIndices: [1],
    });
    expect(reaction.doraIndicators).toHaveLength(1);
    const won = declareRon(reaction, 1);
    expect(won.phase).toBe("won");
    expect(won.winningYaku).toContain("槍槓");
    expect(won.doraIndicators).toHaveLength(1);
  });
});
