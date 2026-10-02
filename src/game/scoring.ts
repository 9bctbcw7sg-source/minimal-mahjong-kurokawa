import { tileToIndex, winningPattern } from "./hand";
import type {
  HandValue,
  Meld,
  ScoreResult,
  Seat,
  Tile,
  YakuValue,
} from "./types";

export interface ScoreContext {
  winType: "tsumo" | "ron";
  winningTile: Tile;
  playerSeat: Seat;
  roundSeat: Seat;
  riichi: boolean;
  melds?: Meld[];
  ippatsu?: boolean;
  haitei?: boolean;
  houtei?: boolean;
  rinshan?: boolean;
  chankan?: boolean;
  doraIndicators?: Tile[];
  uraDoraIndicators?: Tile[];
}

type Group =
  | { type: "sequence"; index: number; open: boolean; kan: false }
  | { type: "triplet"; index: number; open: boolean; kan: boolean };

interface Decomposition {
  pairIndex: number;
  groups: Group[];
}

type WaitType = "ryanmen" | "kanchan" | "penchan" | "shanpon" | "tanki";

interface Placement {
  waitType: WaitType;
  groupIndex: number | null;
}

const SEAT_RANK: Record<Seat, number> = { 東: 1, 南: 2, 西: 3, 北: 4 };

export function doraTileForIndicator(indicator: Tile): Tile {
  let rank: number;
  if (indicator.suit !== "honor") {
    rank = indicator.rank === 9 ? 1 : indicator.rank + 1;
  } else if (indicator.rank <= 4) {
    rank = indicator.rank === 4 ? 1 : indicator.rank + 1;
  } else {
    rank = indicator.rank === 7 ? 5 : indicator.rank + 1;
  }
  return {
    id: `dora-${indicator.suit}-${rank}`,
    suit: indicator.suit,
    rank,
    copy: 0,
  };
}

export function countDora(tiles: Tile[], indicators: Tile[]): number {
  return indicators.reduce((total, indicator) => {
    const dora = doraTileForIndicator(indicator);
    return total + tiles.filter(
      (tile) => tile.suit === dora.suit && tile.rank === dora.rank,
    ).length;
  }, 0);
}

function countsOf(tiles: Tile[]): number[] {
  const counts = Array(34).fill(0) as number[];
  for (const tile of tiles) counts[tileToIndex(tile)] += 1;
  return counts;
}

function collectGroups(counts: number[], groups: Group[]): Group[][] {
  const first = counts.findIndex((count) => count > 0);
  if (first < 0) return [[...groups]];
  const results: Group[][] = [];

  if (counts[first] >= 3) {
    counts[first] -= 3;
    results.push(
      ...collectGroups(counts, [
        ...groups,
        { type: "triplet", index: first, open: false, kan: false },
      ]),
    );
    counts[first] += 3;
  }

  if (
    first < 27 &&
    first % 9 <= 6 &&
    counts[first + 1] > 0 &&
    counts[first + 2] > 0
  ) {
    counts[first] -= 1;
    counts[first + 1] -= 1;
    counts[first + 2] -= 1;
    results.push(
      ...collectGroups(counts, [
        ...groups,
        { type: "sequence", index: first, open: false, kan: false },
      ]),
    );
    counts[first] += 1;
    counts[first + 1] += 1;
    counts[first + 2] += 1;
  }

  return results;
}

function meldGroup(meld: Meld): Group {
  const index = Math.min(...meld.tiles.map(tileToIndex));
  if (meld.type === "chi") {
    return { type: "sequence", index, open: true, kan: false };
  }
  return {
    type: "triplet",
    index,
    open: meld.type !== "kan-closed",
    kan: meld.type.startsWith("kan"),
  };
}

function standardDecompositions(tiles: Tile[], melds: Meld[]): Decomposition[] {
  const counts = countsOf(tiles);
  const results: Decomposition[] = [];
  const requiredConcealedGroups = 4 - melds.length;
  const openGroups = melds.map(meldGroup);
  for (let pairIndex = 0; pairIndex < 34; pairIndex += 1) {
    if (counts[pairIndex] < 2) continue;
    counts[pairIndex] -= 2;
    for (const groups of collectGroups(counts, [])) {
      if (groups.length === requiredConcealedGroups) {
        results.push({ pairIndex, groups: [...groups, ...openGroups] });
      }
    }
    counts[pairIndex] += 2;
  }
  return results;
}

function placementsFor(
  decomposition: Decomposition,
  winningIndex: number,
): Placement[] {
  const placements: Placement[] = [];
  if (decomposition.pairIndex === winningIndex) {
    placements.push({ waitType: "tanki", groupIndex: null });
  }

  decomposition.groups.forEach((group, groupIndex) => {
    if (group.open) return;
    if (group.type === "triplet" && group.index === winningIndex) {
      placements.push({ waitType: "shanpon", groupIndex });
      return;
    }
    if (
      group.type !== "sequence" ||
      winningIndex < group.index ||
      winningIndex > group.index + 2
    ) {
      return;
    }
    const position = winningIndex - group.index;
    if (position === 1) {
      placements.push({ waitType: "kanchan", groupIndex });
    } else if (
      (position === 2 && group.index % 9 === 0) ||
      (position === 0 && group.index % 9 === 6)
    ) {
      placements.push({ waitType: "penchan", groupIndex });
    } else {
      placements.push({ waitType: "ryanmen", groupIndex });
    }
  });

  return placements;
}

function isTerminal(index: number): boolean {
  return index < 27 && (index % 9 === 0 || index % 9 === 8);
}

function isHonor(index: number): boolean {
  return index >= 27;
}

function isTerminalOrHonor(index: number): boolean {
  return isTerminal(index) || isHonor(index);
}

function isValuePair(index: number, context: ScoreContext): boolean {
  if (index >= 31) return true;
  if (index < 27) return false;
  const rank = index - 27 + 1;
  return rank === SEAT_RANK[context.playerSeat] || rank === SEAT_RANK[context.roundSeat];
}

function globalYakuman(tiles: Tile[]): YakuValue[] {
  const allHonors = tiles.every((tile) => tile.suit === "honor");
  const allTerminals = tiles.every(
    (tile) => tile.suit !== "honor" && (tile.rank === 1 || tile.rank === 9),
  );
  const allGreen = tiles.every(
    (tile) =>
      (tile.suit === "sou" && [2, 3, 4, 6, 8].includes(tile.rank)) ||
      (tile.suit === "honor" && tile.rank === 6),
  );
  return [
    ...(allHonors ? [{ name: "字一色", han: 0, yakuman: 1 }] : []),
    ...(allTerminals ? [{ name: "清老頭", han: 0, yakuman: 1 }] : []),
    ...(allGreen ? [{ name: "緑一色", han: 0, yakuman: 1 }] : []),
  ];
}

function flushYaku(tiles: Tile[], isClosed: boolean): YakuValue[] {
  const suits = new Set(tiles.filter((tile) => tile.suit !== "honor").map((tile) => tile.suit));
  const hasHonors = tiles.some((tile) => tile.suit === "honor");
  if (suits.size !== 1) return [];
  return hasHonors
    ? [{ name: "混一色", han: isClosed ? 3 : 2 }]
    : [{ name: "清一色", han: isClosed ? 6 : 5 }];
}

function commonYaku(
  tiles: Tile[],
  context: ScoreContext,
  isClosed: boolean,
): YakuValue[] {
  const yaku: YakuValue[] = [];
  if (context.riichi && isClosed) yaku.push({ name: "リーチ", han: 1 });
  if (context.riichi && context.ippatsu && isClosed) {
    yaku.push({ name: "一発", han: 1 });
  }
  if (context.winType === "tsumo" && isClosed) {
    yaku.push({ name: "門前清自摸和", han: 1 });
  }
  if (context.winType === "tsumo" && context.haitei) {
    yaku.push({ name: "海底摸月", han: 1 });
  }
  if (context.winType === "ron" && context.houtei) {
    yaku.push({ name: "河底撈魚", han: 1 });
  }
  if (context.winType === "tsumo" && context.rinshan) {
    yaku.push({ name: "嶺上開花", han: 1 });
  }
  if (context.winType === "ron" && context.chankan) {
    yaku.push({ name: "槍槓", han: 1 });
  }
  if (
    tiles.every(
      (tile) => tile.suit !== "honor" && tile.rank >= 2 && tile.rank <= 8,
    )
  ) {
    yaku.push({ name: "断么九", han: 1 });
  }
  yaku.push(...flushYaku(tiles, isClosed));
  return yaku;
}

function standardYaku(
  tiles: Tile[],
  decomposition: Decomposition,
  placement: Placement,
  context: ScoreContext,
  isClosed: boolean,
): YakuValue[] {
  const sequences = decomposition.groups.filter((group) => group.type === "sequence");
  const triplets = decomposition.groups.filter((group) => group.type === "triplet");
  const yakuman = globalYakuman(tiles);
  const dragonTriplets = triplets.filter((group) => group.index >= 31).length;
  const windTriplets = triplets.filter(
    (group) => group.index >= 27 && group.index <= 30,
  ).length;
  const kanCount = triplets.filter((group) => group.kan).length;

  if (dragonTriplets === 3) yakuman.push({ name: "大三元", han: 0, yakuman: 1 });
  if (windTriplets === 4) yakuman.push({ name: "大四喜", han: 0, yakuman: 1 });
  if (kanCount === 4) yakuman.push({ name: "四槓子", han: 0, yakuman: 1 });
  if (
    windTriplets === 3 &&
    decomposition.pairIndex >= 27 &&
    decomposition.pairIndex <= 30
  ) {
    yakuman.push({ name: "小四喜", han: 0, yakuman: 1 });
  }

  const ronCompletedTriplet =
    context.winType === "ron" && placement.waitType === "shanpon"
      ? placement.groupIndex
      : null;
  const concealedTriplets = decomposition.groups.filter(
    (group, index) =>
      group.type === "triplet" &&
      !group.open &&
      index !== ronCompletedTriplet,
  ).length;
  if (
    isClosed &&
    triplets.length === 4 &&
    concealedTriplets === 4 &&
    (context.winType === "tsumo" || placement.waitType === "tanki")
  ) {
    yakuman.push({ name: "四暗刻", han: 0, yakuman: 1 });
  }
  if (yakuman.length > 0) return yakuman;

  const yaku = commonYaku(tiles, context, isClosed);
  const tripletIndices = new Set(triplets.map((group) => group.index));
  for (const [rank, name] of [[5, "役牌 白"], [6, "役牌 發"], [7, "役牌 中"]] as const) {
    if (tripletIndices.has(27 + rank - 1)) yaku.push({ name, han: 1 });
  }
  const seatIndex = 27 + SEAT_RANK[context.playerSeat] - 1;
  const roundIndex = 27 + SEAT_RANK[context.roundSeat] - 1;
  if (tripletIndices.has(seatIndex)) yaku.push({ name: `自風 ${context.playerSeat}`, han: 1 });
  if (tripletIndices.has(roundIndex)) yaku.push({ name: `場風 ${context.roundSeat}`, han: 1 });

  const pinfu =
    isClosed &&
    sequences.length === 4 &&
    !isValuePair(decomposition.pairIndex, context) &&
    placement.waitType === "ryanmen";
  if (pinfu) yaku.push({ name: "平和", han: 1 });

  const sequenceCounts = new Map<number, number>();
  for (const group of sequences) {
    sequenceCounts.set(group.index, (sequenceCounts.get(group.index) ?? 0) + 1);
  }
  const identicalPairs = [...sequenceCounts.values()].filter((count) => count >= 2).length;
  if (isClosed && sequences.length === 4 && identicalPairs >= 2) {
    yaku.push({ name: "二盃口", han: 3 });
  } else if (isClosed && identicalPairs >= 1) {
    yaku.push({ name: "一盃口", han: 1 });
  }

  for (let rank = 0; rank <= 6; rank += 1) {
    if ([rank, rank + 9, rank + 18].every((index) => sequenceCounts.has(index))) {
      yaku.push({ name: "三色同順", han: isClosed ? 2 : 1 });
      break;
    }
  }
  for (const suitStart of [0, 9, 18]) {
    if ([suitStart, suitStart + 3, suitStart + 6].every((index) => sequenceCounts.has(index))) {
      yaku.push({ name: "一気通貫", han: isClosed ? 2 : 1 });
      break;
    }
  }

  if (triplets.length === 4) yaku.push({ name: "対々和", han: 2 });
  if (concealedTriplets >= 3) yaku.push({ name: "三暗刻", han: 2 });
  if (kanCount === 3) yaku.push({ name: "三槓子", han: 2 });
  for (let rank = 0; rank < 9; rank += 1) {
    if ([rank, rank + 9, rank + 18].every((index) => tripletIndices.has(index))) {
      yaku.push({ name: "三色同刻", han: 2 });
      break;
    }
  }
  if (
    dragonTriplets === 2 &&
    decomposition.pairIndex >= 31 &&
    decomposition.pairIndex <= 33
  ) {
    yaku.push({ name: "小三元", han: 2 });
  }

  const allOutside = decomposition.groups.every((group) =>
    group.type === "triplet"
      ? isTerminalOrHonor(group.index)
      : group.index % 9 === 0 || group.index % 9 === 6,
  ) && isTerminalOrHonor(decomposition.pairIndex);
  const hasHonor = tiles.some((tile) => tile.suit === "honor");
  if (allOutside && sequences.length > 0) {
    yaku.push({
      name: hasHonor ? "混全帯么九" : "純全帯么九",
      han: hasHonor ? (isClosed ? 2 : 1) : isClosed ? 3 : 2,
    });
  }
  if (tiles.every((tile) => tile.suit === "honor" || tile.rank === 1 || tile.rank === 9)) {
    yaku.push({ name: "混老頭", han: 2 });
  }

  return yaku;
}

function calculateFu(
  decomposition: Decomposition,
  placement: Placement,
  context: ScoreContext,
  pinfu: boolean,
  isClosed: boolean,
): number {
  if (pinfu && context.winType === "tsumo") return 20;
  let fu = 20;
  if (context.winType === "ron" && isClosed) fu += 10;
  if (context.winType === "tsumo") fu += 2;
  if (isValuePair(decomposition.pairIndex, context)) fu += 2;
  if (["tanki", "kanchan", "penchan"].includes(placement.waitType)) fu += 2;

  decomposition.groups.forEach((group, index) => {
    if (group.type !== "triplet") return;
    const openByRon =
      context.winType === "ron" &&
      placement.waitType === "shanpon" &&
      placement.groupIndex === index;
    const outside = isTerminalOrHonor(group.index);
    const openTriplet = group.open || openByRon;
    const tripletFu = openTriplet ? (outside ? 4 : 2) : outside ? 8 : 4;
    fu += group.kan ? tripletFu * 4 : tripletFu;
  });

  if (!isClosed && fu === 20) return 30;
  return Math.ceil(fu / 10) * 10;
}

function limitFor(han: number, fu: number, yakuman: number): {
  name: string | null;
  base: number;
} {
  if (yakuman > 0) {
    return { name: yakuman > 1 ? `${yakuman}倍役満` : "役満", base: 8000 * yakuman };
  }
  if (han >= 13) return { name: "数え役満", base: 8000 };
  if (han >= 11) return { name: "三倍満", base: 6000 };
  if (han >= 8) return { name: "倍満", base: 4000 };
  if (han >= 6) return { name: "跳満", base: 3000 };
  if (
    han >= 5 ||
    (han === 4 && fu >= 30) ||
    (han === 3 && fu >= 60)
  ) {
    return { name: "満貫", base: 2000 };
  }
  return { name: null, base: Math.min(fu * 2 ** (han + 2), 2000) };
}

function makeValue(yaku: YakuValue[], fu: number): HandValue | null {
  const yakuman = yaku.reduce((sum, item) => sum + (item.yakuman ?? 0), 0);
  const han = yakuman > 0 ? 0 : yaku.reduce((sum, item) => sum + item.han, 0);
  if (yakuman === 0 && han === 0) return null;
  const resolvedFu = yakuman > 0 ? 0 : fu;
  const limit = limitFor(han, resolvedFu, yakuman);
  return {
    yaku,
    han,
    fu: resolvedFu,
    yakuman,
    limitName: limit.name,
    basePoints: limit.base,
  };
}

function addBonusHan(
  value: HandValue | null,
  allTiles: Tile[],
  context: ScoreContext,
): HandValue | null {
  if (!value || value.yakuman > 0) return value;
  const dora = countDora(allTiles, context.doraIndicators ?? []);
  const uraDora = context.riichi
    ? countDora(allTiles, context.uraDoraIndicators ?? [])
    : 0;
  if (dora === 0 && uraDora === 0) return value;
  return makeValue(
    [
      ...value.yaku,
      ...(dora > 0 ? [{ name: `ドラ ${dora}`, han: dora }] : []),
      ...(uraDora > 0
        ? [{ name: `裏ドラ ${uraDora}`, han: uraDora }]
        : []),
    ],
    value.fu,
  );
}

export function evaluateHand(
  tiles: Tile[],
  context: ScoreContext,
): HandValue | null {
  const melds = context.melds ?? [];
  const isClosed = melds.every((meld) => meld.type === "kan-closed");
  const allTiles = [...tiles, ...melds.flatMap((meld) => meld.tiles)];
  const pattern = winningPattern(tiles, melds.length);
  if (!pattern) return null;

  if (pattern === "thirteen-orphans") {
    return makeValue([{ name: "国士無双", han: 0, yakuman: 1 }], 0);
  }

  if (pattern === "seven-pairs") {
    const yakuman = globalYakuman(allTiles);
    if (yakuman.length > 0) return makeValue(yakuman, 0);
    const yaku = [
      ...commonYaku(allTiles, context, isClosed),
      { name: "七対子", han: 2 },
    ];
    if (tiles.every((tile) => tile.suit === "honor" || tile.rank === 1 || tile.rank === 9)) {
      yaku.push({ name: "混老頭", han: 2 });
    }
    return addBonusHan(makeValue(yaku, 25), allTiles, context);
  }

  const winningIndex = tileToIndex(context.winningTile);
  const candidates: HandValue[] = [];
  for (const decomposition of standardDecompositions(tiles, melds)) {
    for (const placement of placementsFor(decomposition, winningIndex)) {
      const yaku = standardYaku(
        allTiles,
        decomposition,
        placement,
        context,
        isClosed,
      );
      const pinfu = yaku.some((item) => item.name === "平和");
      const value = makeValue(
        yaku,
        calculateFu(decomposition, placement, context, pinfu, isClosed),
      );
      const withBonus = addBonusHan(value, allTiles, context);
      if (withBonus) candidates.push(withBonus);
    }
  }

  return candidates.sort(
    (a, b) => b.basePoints - a.basePoints || b.han - a.han || b.fu - a.fu,
  )[0] ?? null;
}

function round100(points: number): number {
  return Math.ceil(points / 100) * 100;
}

export function settleScore(
  value: HandValue,
  options: {
    winnerIndex: number;
    loserIndex: number | null;
    dealerIndex: number;
    playerCount: number;
    honba: number;
    riichiSticks: number;
    winType: "tsumo" | "ron";
  },
): ScoreResult {
  const payments = Array(options.playerCount).fill(0) as number[];
  const winnerIsDealer = options.winnerIndex === options.dealerIndex;

  if (options.winType === "ron") {
    if (options.loserIndex === null) throw new Error("ロンの放銃者がありません");
    const payment = round100(value.basePoints * (winnerIsDealer ? 6 : 4));
    const total = payment + options.honba * 300;
    payments[options.loserIndex] -= total;
    payments[options.winnerIndex] += total;
  } else {
    for (let index = 0; index < options.playerCount; index += 1) {
      if (index === options.winnerIndex) continue;
      const multiplier = winnerIsDealer || index === options.dealerIndex ? 2 : 1;
      const payment = round100(value.basePoints * multiplier) + options.honba * 100;
      payments[index] -= payment;
      payments[options.winnerIndex] += payment;
    }
  }

  payments[options.winnerIndex] += options.riichiSticks * 1000;
  return {
    ...value,
    payments,
    totalPoints: payments[options.winnerIndex],
  };
}
