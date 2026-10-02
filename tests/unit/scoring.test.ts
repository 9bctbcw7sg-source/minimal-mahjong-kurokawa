import { describe, expect, it } from "vitest";
import {
  doraTileForIndicator,
  evaluateHand,
  settleScore,
} from "../../src/game/scoring";
import { createTileSet } from "../../src/game/tiles";
import type { Seat, Tile } from "../../src/game/types";

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

function valueFor(
  codes: string[],
  options: {
    winType?: "tsumo" | "ron";
    seat?: Seat;
    riichi?: boolean;
    winningCode?: string;
  } = {},
) {
  const tiles = tilesFromCodes(codes);
  const winningIndex = options.winningCode
    ? codes.lastIndexOf(options.winningCode)
    : codes.length - 1;
  const value = evaluateHand(tiles, {
    winType: options.winType ?? "ron",
    winningTile: tiles[winningIndex],
    playerSeat: options.seat ?? "南",
    roundSeat: "東",
    riichi: options.riichi ?? false,
  });
  if (!value) throw new Error("和了点を計算できませんでした");
  return value;
}

describe("翻と符", () => {
  it("平和ロンを1翻30符として計算する", () => {
    const value = valueFor([
      "m1", "m2", "m3", "m4", "m5", "m6", "p2",
      "p3", "p4", "s2", "s3", "s4", "p5", "p5",
    ], { winningCode: "s4" });

    expect(value.yaku.map((yaku) => yaku.name)).toContain("平和");
    expect(value.han).toBe(1);
    expect(value.fu).toBe(30);
  });

  it("親の断么九・平和・門前ツモを3翻20符として精算する", () => {
    const value = valueFor([
      "m2", "m3", "m4", "m4", "m5", "m6", "p2",
      "p3", "p4", "s3", "s4", "s5", "p5", "p5",
    ], { winType: "tsumo", seat: "東", winningCode: "s3" });
    const score = settleScore(value, {
      winnerIndex: 0,
      loserIndex: null,
      dealerIndex: 0,
      playerCount: 4,
      honba: 0,
      riichiSticks: 0,
      winType: "tsumo",
    });

    expect(value.yaku.map((yaku) => yaku.name)).toEqual(
      expect.arrayContaining(["門前清自摸和", "断么九", "平和"]),
    );
    expect([value.han, value.fu]).toEqual([3, 20]);
    expect(score.payments).toEqual([3_900, -1_300, -1_300, -1_300]);
  });

  it("七対子を固定25符として計算する", () => {
    const value = valueFor([
      "m1", "m1", "m2", "m2", "p3", "p3", "p4",
      "p4", "s5", "s5", "s6", "s6", "h7", "h7",
    ], { riichi: true, winningCode: "h7" });

    expect(value.yaku.map((yaku) => yaku.name)).toEqual(
      expect.arrayContaining(["リーチ", "七対子"]),
    );
    expect([value.han, value.fu]).toEqual([3, 25]);
  });

  it("4翻30符を切り上げ満貫にする", () => {
    const value = valueFor([
      "m2", "m3", "m4", "p2", "p3", "p4", "s2",
      "s3", "s4", "m7", "m8", "m9", "p5", "p5",
    ], { riichi: true, winningCode: "s4" });

    expect(value.yaku.map((yaku) => yaku.name)).toEqual(
      expect.arrayContaining(["リーチ", "平和", "三色同順"]),
    );
    expect([value.han, value.fu, value.limitName]).toEqual([4, 30, "満貫"]);
  });
});

describe("ドラと状況役", () => {
  it("数牌・風牌・三元牌の表示牌から次のドラを求める", () => {
    const [nineMan, north, red] = tilesFromCodes(["m9", "h4", "h7"]);
    expect(doraTileForIndicator(nineMan)).toMatchObject({ suit: "man", rank: 1 });
    expect(doraTileForIndicator(north)).toMatchObject({ suit: "honor", rank: 1 });
    expect(doraTileForIndicator(red)).toMatchObject({ suit: "honor", rank: 5 });
  });

  it("通常ドラとリーチ時の裏ドラを翻へ加算する", () => {
    const tiles = tilesFromCodes([
      "m2", "m3", "m4", "m4", "m5", "m6", "p2",
      "p3", "p4", "s3", "s4", "s5", "p5", "p5",
    ]);
    const [doraIndicator] = tilesFromCodes(["p4"]);
    const [uraIndicator] = tilesFromCodes(["s2"]);
    const value = evaluateHand(tiles, {
      winType: "ron",
      winningTile: tiles[11],
      playerSeat: "南",
      roundSeat: "東",
      riichi: true,
      doraIndicators: [doraIndicator],
      uraDoraIndicators: [uraIndicator],
    });

    expect(value?.yaku).toEqual(
      expect.arrayContaining([
        { name: "ドラ 2", han: 2 },
        { name: "裏ドラ 1", han: 1 },
      ]),
    );
  });

  it("一発・海底摸月・河底撈魚をそれぞれ1翻で判定する", () => {
    const tiles = tilesFromCodes([
      "m2", "m3", "m4", "m4", "m5", "m6", "p2",
      "p3", "p4", "s3", "s4", "s5", "p5", "p5",
    ]);
    const ippatsu = evaluateHand(tiles, {
      winType: "ron",
      winningTile: tiles[11],
      playerSeat: "南",
      roundSeat: "東",
      riichi: true,
      ippatsu: true,
    });
    const haitei = evaluateHand(tiles, {
      winType: "tsumo",
      winningTile: tiles[11],
      playerSeat: "南",
      roundSeat: "東",
      riichi: false,
      haitei: true,
    });
    const houtei = evaluateHand(tiles, {
      winType: "ron",
      winningTile: tiles[11],
      playerSeat: "南",
      roundSeat: "東",
      riichi: false,
      houtei: true,
    });

    expect(ippatsu?.yaku).toContainEqual({ name: "一発", han: 1 });
    expect(haitei?.yaku).toContainEqual({ name: "海底摸月", han: 1 });
    expect(houtei?.yaku).toContainEqual({ name: "河底撈魚", han: 1 });
  });

  it("嶺上開花と槍槓をそれぞれ1翻で判定する", () => {
    const tiles = tilesFromCodes([
      "m2", "m3", "m4", "m4", "m5", "m6", "p2",
      "p3", "p4", "s3", "s4", "s5", "p5", "p5",
    ]);
    const rinshan = evaluateHand(tiles, {
      winType: "tsumo",
      winningTile: tiles[11],
      playerSeat: "南",
      roundSeat: "東",
      riichi: false,
      rinshan: true,
    });
    const chankan = evaluateHand(tiles, {
      winType: "ron",
      winningTile: tiles[11],
      playerSeat: "南",
      roundSeat: "東",
      riichi: false,
      chankan: true,
    });

    expect(rinshan?.yaku).toContainEqual({ name: "嶺上開花", han: 1 });
    expect(chankan?.yaku).toContainEqual({ name: "槍槓", han: 1 });
  });
});

describe("点数精算", () => {
  it("子の平和ロンを1000点として精算する", () => {
    const value = valueFor([
      "m1", "m2", "m3", "m4", "m5", "m6", "p2",
      "p3", "p4", "s2", "s3", "s4", "p5", "p5",
    ], { winningCode: "s4" });
    const score = settleScore(value, {
      winnerIndex: 1,
      loserIndex: 2,
      dealerIndex: 0,
      playerCount: 4,
      honba: 0,
      riichiSticks: 0,
      winType: "ron",
    });

    expect(score.payments).toEqual([0, 1_000, -1_000, 0]);
  });

  it("本場と供託リーチ棒を和了者へ加算する", () => {
    const value = valueFor([
      "m1", "m2", "m3", "m4", "m5", "m6", "p2",
      "p3", "p4", "s2", "s3", "s4", "p5", "p5",
    ], { winningCode: "s4" });
    const score = settleScore(value, {
      winnerIndex: 1,
      loserIndex: 2,
      dealerIndex: 0,
      playerCount: 4,
      honba: 2,
      riichiSticks: 1,
      winType: "ron",
    });

    expect(score.payments).toEqual([0, 2_600, -1_600, 0]);
    expect(score.totalPoints).toBe(2_600);
  });

  it("国士無双の子ロンを32000点として精算する", () => {
    const value = valueFor([
      "m1", "m9", "p1", "p9", "s1", "s9", "h1",
      "h2", "h3", "h4", "h5", "h6", "h7", "m1",
    ], { winningCode: "m1" });
    const score = settleScore(value, {
      winnerIndex: 1,
      loserIndex: 3,
      dealerIndex: 0,
      playerCount: 4,
      honba: 0,
      riichiSticks: 0,
      winType: "ron",
    });

    expect([value.yakuman, value.limitName]).toEqual([1, "役満"]);
    expect(score.payments).toEqual([0, 32_000, 0, -32_000]);
  });
});
