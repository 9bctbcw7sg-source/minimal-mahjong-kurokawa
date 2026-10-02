import { findRiichiOptions, findWaits } from "./hand";
import { evaluateHand, settleScore } from "./scoring";
import { createTileSet, sortTiles, tileTypeKey } from "./tiles";
import type {
  CallOption,
  GameState,
  HandNumber,
  KanOption,
  MatchRules,
  PlayerState,
  RoundWind,
  Seat,
  Tile,
} from "./types";

export type RandomSource = () => number;

const SEATS: Seat[] = ["東", "南", "西", "北"];
const ROUND_WINDS: RoundWind[] = ["東", "南", "西", "北"];

export const DEFAULT_MATCH_RULES: MatchRules = {
  matchType: "hanchan",
  bankruptcyEnabled: true,
};

function roundLabel(roundWind: RoundWind, handNumber: HandNumber): string {
  return `${roundWind}${["一", "二", "三", "四"][handNumber - 1]}局`;
}

function seatFor(playerIndex: number, dealerIndex: number): Seat {
  return SEATS[(playerIndex - dealerIndex + SEATS.length) % SEATS.length];
}

export function shuffleTiles(
  tiles: Tile[],
  random: RandomSource = Math.random,
): Tile[] {
  const result = [...tiles];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

function emptyPlayers(): PlayerState[] {
  const playerSeats: Array<Pick<PlayerState, "id" | "name" | "seat" | "isHuman">> = [
    { id: "you", name: "あなた", seat: "東", isHuman: true },
    { id: "ai-south", name: "南家", seat: "南", isHuman: false },
    { id: "ai-west", name: "西家", seat: "西", isHuman: false },
    { id: "ai-north", name: "北家", seat: "北", isHuman: false },
  ];

  return playerSeats.map((player) => ({
    ...player,
    hand: [],
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
  }));
}

function dealHand(
  previousPlayers: PlayerState[],
  dealerIndex: number,
  random: RandomSource,
): {
  players: PlayerState[];
  wall: Tile[];
  deadWall: Tile[];
  rinshanTiles: Tile[];
  doraIndicators: Tile[];
  uraDoraIndicators: Tile[];
  kanDoraIndicators: Tile[];
  kanUraDoraIndicators: Tile[];
} {
  const shuffled = shuffleTiles(createTileSet(), random);
  const deadWall = shuffled.splice(0, 14);
  const wall = shuffled;
  const players: PlayerState[] = previousPlayers.map((player, index) => {
    const seat = seatFor(index, dealerIndex);
    return {
      ...player,
      name: player.isHuman ? "あなた" : `${seat}家`,
      seat,
      hand: [] as Tile[],
      drawnTile: null,
      discards: [] as Tile[],
      melds: [],
      mustDiscardAfterCall: false,
      forbiddenDiscardKeys: [],
      riichi: false,
      ippatsuEligible: false,
      riichiDiscardIndex: null,
      temporaryFuriten: false,
    };
  });

  for (let tileNumber = 0; tileNumber < 13; tileNumber += 1) {
    for (const player of players) {
      const tile = wall.pop();
      if (!tile) throw new Error("配牌中に牌山が不足しました");
      player.hand.push(tile);
    }
  }

  for (const player of players) player.hand = sortTiles(player.hand);

  const firstDraw = wall.pop();
  if (!firstDraw) throw new Error("親のツモ牌がありません");
  players[dealerIndex].drawnTile = firstDraw;
  return {
    players,
    wall,
    deadWall,
    rinshanTiles: deadWall.slice(0, 4),
    doraIndicators: [deadWall[4]],
    uraDoraIndicators: [deadWall[5]],
    kanDoraIndicators: [deadWall[6], deadWall[8], deadWall[10], deadWall[12]],
    kanUraDoraIndicators: [deadWall[7], deadWall[9], deadWall[11], deadWall[13]],
  };
}

export function createInitialGame(
  random: RandomSource = Math.random,
  callsEnabled = true,
  rules: Partial<MatchRules> = {},
): GameState {
  const matchRules = { ...DEFAULT_MATCH_RULES, ...rules };
  const dealerIndex = 0;
  const {
    players,
    wall,
    deadWall,
    rinshanTiles,
    doraIndicators,
    uraDoraIndicators,
    kanDoraIndicators,
    kanUraDoraIndicators,
  } = dealHand(emptyPlayers(), dealerIndex, random);

  return {
    phase: "playing",
    round: "東一局",
    roundWind: "東",
    handNumber: 1,
    dealerIndex,
    wall,
    deadWall,
    rinshanTiles,
    doraIndicators,
    uraDoraIndicators,
    kanDoraIndicators,
    kanUraDoraIndicators,
    players,
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
    matchType: matchRules.matchType,
    bankruptcyEnabled: matchRules.bankruptcyEnabled,
    callsEnabled,
    rinshanPlayerIndex: null,
  };
}

function clonePlayers(players: PlayerState[]): PlayerState[] {
  return players.map((player) => ({
    ...player,
    hand: [...player.hand],
    discards: [...player.discards],
    melds: player.melds.map((meld) => ({ ...meld, tiles: [...meld.tiles] })),
    forbiddenDiscardKeys: [...player.forbiddenDiscardKeys],
  }));
}

export function isPlayerFuriten(player: PlayerState): boolean {
  if (player.temporaryFuriten) return true;
  const waitKeys = new Set(
    findWaits(player.hand, player.melds.length).map(tileTypeKey),
  );
  return player.discards.some((tile) => waitKeys.has(tileTypeKey(tile)));
}

interface WinSituation {
  ippatsu?: boolean;
  houtei?: boolean;
  chankan?: boolean;
  doraIndicators?: Tile[];
  uraDoraIndicators?: Tile[];
}

function ronValue(
  player: PlayerState,
  tile: Tile,
  roundWind: RoundWind,
  situation: WinSituation = {},
) {
  return evaluateHand([...player.hand, tile], {
    winType: "ron",
    winningTile: tile,
    playerSeat: player.seat,
    roundSeat: roundWind,
    riichi: player.riichi,
    melds: player.melds,
    ippatsu: situation.ippatsu ?? player.ippatsuEligible,
    houtei: situation.houtei,
    chankan: situation.chankan,
    doraIndicators: situation.doraIndicators,
    uraDoraIndicators: situation.uraDoraIndicators,
  });
}

export function canPlayerRon(
  player: PlayerState,
  tile: Tile,
  roundWind: RoundWind = "東",
  situation: WinSituation = {},
): boolean {
  return (
    !isPlayerFuriten(player) &&
    ronValue(player, tile, roundWind, situation) !== null
  );
}

function applyPayments(players: PlayerState[], payments: number[]): void {
  players.forEach((player, index) => {
    player.points += payments[index] ?? 0;
  });
}

function findRonCandidates(
  players: PlayerState[],
  discarderIndex: number,
  tile: Tile,
  roundWind: RoundWind,
  situation: WinSituation,
): number[] {
  const candidates: number[] = [];
  for (let distance = 1; distance < players.length; distance += 1) {
    const playerIndex = (discarderIndex + distance) % players.length;
    if (canPlayerRon(players[playerIndex], tile, roundWind, situation)) {
      candidates.push(playerIndex);
    }
  }
  return candidates;
}

function tilesOfType(player: PlayerState, tile: Tile): Tile[] {
  const key = tileTypeKey(tile);
  return player.hand.filter((candidate) => tileTypeKey(candidate) === key);
}

export function findCallOptions(
  players: PlayerState[],
  discarderIndex: number,
  tile: Tile,
  callsEnabled = true,
  kanAvailable = true,
): CallOption[] {
  if (!callsEnabled) return [];
  const tripletCallOptions: CallOption[] = [];

  for (let distance = 1; distance < players.length; distance += 1) {
    const playerIndex = (discarderIndex + distance) % players.length;
    const player = players[playerIndex];
    if (player.riichi) continue;
    const matches = tilesOfType(player, tile);
    if (kanAvailable && matches.length >= 3) {
      const consumedTileIds = matches.slice(0, 3).map((candidate) => candidate.id);
      tripletCallOptions.push({
        id: `kan-open-${playerIndex}-${consumedTileIds.join("-")}`,
        type: "kan-open",
        playerIndex,
        consumedTileIds,
      });
    }
    if (matches.length >= 2) {
      const consumedTileIds = matches.slice(0, 2).map((candidate) => candidate.id);
      tripletCallOptions.push({
        id: `pon-${playerIndex}-${consumedTileIds.join("-")}`,
        type: "pon",
        playerIndex,
        consumedTileIds,
      });
    }
  }

  const chiOptions: CallOption[] = [];
  const nextPlayerIndex = (discarderIndex + 1) % players.length;
  const nextPlayer = players[nextPlayerIndex];
  if (tile.suit !== "honor" && !nextPlayer.riichi) {
    for (const sequenceStart of [tile.rank - 2, tile.rank - 1, tile.rank]) {
      if (sequenceStart < 1 || sequenceStart > 7) continue;
      const requiredRanks = [sequenceStart, sequenceStart + 1, sequenceStart + 2]
        .filter((rank) => rank !== tile.rank);
      const consumed = requiredRanks.map((rank) =>
        nextPlayer.hand.find(
          (candidate) => candidate.suit === tile.suit && candidate.rank === rank,
        ),
      );
      if (consumed.some((candidate) => !candidate)) continue;
      const consumedTileIds = consumed.map((candidate) => candidate!.id);
      chiOptions.push({
        id: `chi-${nextPlayerIndex}-${sequenceStart}-${consumedTileIds.join("-")}`,
        type: "chi",
        playerIndex: nextPlayerIndex,
        consumedTileIds,
        sequenceStart,
      });
    }
  }

  // ロン確認後、放銃者から近い大明槓・ポン、最後に下家のチーを確認する。
  return [...tripletCallOptions, ...chiOptions];
}

function sameWaits(before: Tile[], after: Tile[]): boolean {
  const beforeKeys = before.map(tileTypeKey).sort();
  const afterKeys = after.map(tileTypeKey).sort();
  return beforeKeys.length === afterKeys.length &&
    beforeKeys.every((key, index) => key === afterKeys[index]);
}

export function findKanOptions(
  state: GameState,
  playerIndex = state.currentPlayerIndex,
): KanOption[] {
  if (
    state.phase !== "playing" ||
    state.currentPlayerIndex !== playerIndex ||
    state.wall.length === 0 ||
    state.rinshanTiles.length === 0 ||
    state.kanDoraIndicators.length === 0
  ) {
    return [];
  }
  const player = state.players[playerIndex];
  if (!player.drawnTile || player.mustDiscardAfterCall) return [];
  const allTiles = [...player.hand, player.drawnTile];
  const groups = new Map<string, Tile[]>();
  for (const tile of allTiles) {
    const key = tileTypeKey(tile);
    groups.set(key, [...(groups.get(key) ?? []), tile]);
  }

  const options: KanOption[] = [];
  for (const tiles of groups.values()) {
    if (tiles.length !== 4) continue;
    if (player.riichi) {
      if (!tiles.some((tile) => tile.id === player.drawnTile?.id)) continue;
      const removedIds = new Set(tiles.map((tile) => tile.id));
      const afterHand = player.hand.filter((tile) => !removedIds.has(tile.id));
      if (!sameWaits(
        findWaits(player.hand, player.melds.length),
        findWaits(afterHand, player.melds.length + 1),
      )) continue;
    }
    options.push({
      id: `kan-closed-${playerIndex}-${tiles.map((tile) => tile.id).join("-")}`,
      type: "kan-closed",
      playerIndex,
      consumedTileIds: tiles.map((tile) => tile.id),
    });
  }

  if (!player.riichi) {
    for (const meld of player.melds) {
      if (meld.type !== "pon") continue;
      const added = allTiles.find(
        (tile) => tileTypeKey(tile) === tileTypeKey(meld.tiles[0]),
      );
      if (!added) continue;
      options.push({
        id: `kan-added-${playerIndex}-${meld.id}-${added.id}`,
        type: "kan-added",
        playerIndex,
        consumedTileIds: [added.id],
        meldId: meld.id,
      });
    }
  }
  return options;
}

export function currentCallOptions(state: GameState): CallOption[] {
  if (state.phase !== "reaction" || !state.pendingDiscard) return [];
  if (state.pendingDiscard.ronCandidateIndices.length > 0) return [];
  const playerIndex = state.pendingDiscard.callOptions[0]?.playerIndex;
  return playerIndex === undefined
    ? []
    : state.pendingDiscard.callOptions.filter(
        (option) => option.playerIndex === playerIndex,
      );
}

function takePlayerTiles(player: PlayerState, tileIds: string[]): Tile[] | null {
  const idSet = new Set(tileIds);
  const allTiles = [...player.hand, ...(player.drawnTile ? [player.drawnTile] : [])];
  const taken = tileIds.map((id) => allTiles.find((tile) => tile.id === id));
  if (taken.some((tile) => !tile)) return null;
  player.hand = sortTiles(player.hand.filter((tile) => !idSet.has(tile.id)));
  if (player.drawnTile && idSet.has(player.drawnTile.id)) {
    player.drawnTile = null;
  } else if (player.drawnTile) {
    player.hand = sortTiles([...player.hand, player.drawnTile]);
    player.drawnTile = null;
  }
  return taken as Tile[];
}

function completeKanDraw(
  state: GameState,
  players: PlayerState[],
  playerIndex: number,
): GameState {
  const rinshan = state.rinshanTiles[0];
  const nextDora = state.kanDoraIndicators[0];
  const nextUra = state.kanUraDoraIndicators[0];
  if (!rinshan || !nextDora || !nextUra || state.wall.length === 0) return state;
  const wall = [...state.wall];
  const replacement = wall.pop();
  if (!replacement) return state;
  const deadWall = state.deadWall.filter((tile) => tile.id !== rinshan.id);
  deadWall.push(replacement);
  const player = players[playerIndex];
  player.drawnTile = rinshan;
  player.mustDiscardAfterCall = false;
  player.forbiddenDiscardKeys = [];
  player.temporaryFuriten = false;
  return {
    ...state,
    phase: "playing",
    players,
    wall,
    deadWall,
    rinshanTiles: state.rinshanTiles.slice(1),
    doraIndicators: [...state.doraIndicators, nextDora],
    uraDoraIndicators: [...state.uraDoraIndicators, nextUra],
    kanDoraIndicators: state.kanDoraIndicators.slice(1),
    kanUraDoraIndicators: state.kanUraDoraIndicators.slice(1),
    currentPlayerIndex: playerIndex,
    pendingDiscard: null,
    rinshanPlayerIndex: playerIndex,
    turnNumber: state.turnNumber + 1,
  };
}

function completeAddedKan(state: GameState): GameState {
  const pending = state.pendingDiscard;
  if (!pending || pending.source !== "added-kan" || !pending.kanMeldId) return state;
  const players = clonePlayers(state.players);
  const player = players[pending.playerIndex];
  const meld = player.melds.find((candidate) => candidate.id === pending.kanMeldId);
  if (!meld || meld.type !== "pon") return state;
  meld.type = "kan-added";
  meld.tiles = sortTiles([...meld.tiles, pending.tile]);
  players.forEach((candidate) => {
    candidate.ippatsuEligible = false;
  });
  return completeKanDraw({ ...state, pendingDiscard: null }, players, pending.playerIndex);
}

function continueAfterDiscard(state: GameState): GameState {
  if (state.phase !== "reaction" || !state.pendingDiscard) return state;
  if (state.pendingDiscard.ronCandidateIndices.length > 0) return state;
  if (state.pendingDiscard.callOptions.length > 0) return state;
  if (state.pendingDiscard.source === "added-kan") return completeAddedKan(state);

  if (state.wall.length === 0) {
    const players = clonePlayers(state.players);
    const tenpaiIndices = players.flatMap((player, index) =>
      findWaits(player.hand, player.melds.length).length > 0 ? [index] : [],
    );
    const payments = Array(players.length).fill(0) as number[];
    if (tenpaiIndices.length > 0 && tenpaiIndices.length < players.length) {
      const tenpaiPayment = 3_000 / tenpaiIndices.length;
      const notenPayment = 3_000 / (players.length - tenpaiIndices.length);
      players.forEach((_, index) => {
        payments[index] = tenpaiIndices.includes(index)
          ? tenpaiPayment
          : -notenPayment;
      });
      applyPayments(players, payments);
    }
    return {
      ...state,
      phase: "exhausted",
      players,
      drawResult: { tenpaiIndices, payments },
      pendingDiscard: null,
      turnNumber: state.turnNumber + 1,
    };
  }

  const players = clonePlayers(state.players);
  const wall = [...state.wall];
  const nextPlayerIndex =
    (state.pendingDiscard.playerIndex + 1) % players.length;
  const nextDraw = wall.pop();
  if (!nextDraw) throw new Error("ツモ牌がありません");
  players[nextPlayerIndex].drawnTile = nextDraw;
  players[nextPlayerIndex].mustDiscardAfterCall = false;
  players[nextPlayerIndex].forbiddenDiscardKeys = [];
  if (!players[nextPlayerIndex].riichi) {
    players[nextPlayerIndex].temporaryFuriten = false;
  }

  return {
    ...state,
    phase: "playing",
    wall,
    players,
    currentPlayerIndex: nextPlayerIndex,
    pendingDiscard: null,
    rinshanPlayerIndex: null,
    turnNumber: state.turnNumber + 1,
  };
}

export function setCallsEnabled(state: GameState, callsEnabled: boolean): GameState {
  const updated = { ...state, callsEnabled };
  if (
    !callsEnabled &&
    updated.phase === "reaction" &&
    updated.pendingDiscard?.callOptions.length
  ) {
    return continueAfterDiscard({
      ...updated,
      pendingDiscard: { ...updated.pendingDiscard, callOptions: [] },
    });
  }
  return updated;
}

export function declareKan(state: GameState, optionId: string): GameState {
  const option = findKanOptions(state).find((candidate) => candidate.id === optionId);
  if (!option) return state;
  const players = clonePlayers(state.players);
  const player = players[option.playerIndex];
  const consumed = takePlayerTiles(player, option.consumedTileIds);
  if (!consumed) return state;
  players.forEach((candidate) => {
    candidate.ippatsuEligible = false;
  });

  if (option.type === "kan-closed") {
    player.melds.push({
      id: `meld-${state.turnNumber}-${option.id}`,
      type: "kan-closed",
      tiles: sortTiles(consumed),
      calledTileId: null,
      fromPlayerIndex: null,
    });
    return completeKanDraw(state, players, option.playerIndex);
  }

  const meld = player.melds.find((candidate) => candidate.id === option.meldId);
  const addedTile = consumed[0];
  if (!meld || meld.type !== "pon" || !addedTile) return state;
  const reactionState: GameState = {
    ...state,
    phase: "reaction",
    players,
    pendingDiscard: {
      tile: addedTile,
      playerIndex: option.playerIndex,
      ronCandidateIndices: findRonCandidates(
        players,
        option.playerIndex,
        addedTile,
        state.roundWind,
        {
          chankan: true,
          doraIndicators: state.doraIndicators,
          uraDoraIndicators: state.uraDoraIndicators,
        },
      ),
      callOptions: [],
      source: "added-kan",
      kanMeldId: meld.id,
    },
    rinshanPlayerIndex: null,
  };
  return continueAfterDiscard(reactionState);
}

export function discardTile(
  state: GameState,
  tileId: string,
  declareRiichi = false,
): GameState {
  if (state.phase !== "playing") return state;

  const players = clonePlayers(state.players);
  const current = players[state.currentPlayerIndex];
  const drawn = current.drawnTile;
  const discardingAfterCall = current.mustDiscardAfterCall && !drawn;
  if (!drawn && !discardingAfterCall) return state;
  if (drawn && current.riichi && drawn.id !== tileId) return state;
  const selectedTile = drawn?.id === tileId
    ? drawn
    : current.hand.find((tile) => tile.id === tileId);
  if (!selectedTile) return state;
  if (current.forbiddenDiscardKeys.includes(tileTypeKey(selectedTile))) {
    return state;
  }
  const discardingRinshan = state.rinshanPlayerIndex === state.currentPlayerIndex;

  if (declareRiichi) {
    if (!drawn || current.melds.some((meld) => meld.type !== "kan-closed")) return state;
    const legalRiichi = findRiichiOptions(
      [...current.hand, drawn],
      current.melds.length,
    ).some(
      (option) => option.discardId === tileId,
    );
    if (current.riichi || current.points < 1_000 || !legalRiichi) return state;
  }

  let discarded: Tile;
  if (drawn?.id === tileId) {
    discarded = drawn;
  } else {
    const handIndex = current.hand.findIndex((tile) => tile.id === tileId);
    if (handIndex < 0) return state;
    [discarded] = current.hand.splice(handIndex, 1);
    current.hand = drawn
      ? sortTiles([...current.hand, drawn])
      : sortTiles(current.hand);
  }

  current.drawnTile = null;
  current.mustDiscardAfterCall = false;
  current.forbiddenDiscardKeys = [];
  current.discards.push(discarded);
  if (declareRiichi) {
    current.riichi = true;
    current.ippatsuEligible = true;
    current.riichiDiscardIndex = current.discards.length - 1;
    current.points -= 1_000;
  } else if (current.riichi && current.ippatsuEligible) {
    current.ippatsuEligible = false;
  }

  const reactionState: GameState = {
    ...state,
    phase: "reaction",
    players,
    riichiSticks: state.riichiSticks + (declareRiichi ? 1 : 0),
    pendingDiscard: {
      tile: discarded,
      playerIndex: state.currentPlayerIndex,
      ronCandidateIndices: findRonCandidates(
        players,
        state.currentPlayerIndex,
        discarded,
        state.roundWind,
        {
          houtei: state.wall.length === 0 && !discardingRinshan,
          doraIndicators: state.doraIndicators,
          uraDoraIndicators: state.uraDoraIndicators,
        },
      ),
      callOptions:
        state.wall.length > 0
          ? findCallOptions(
              players,
              state.currentPlayerIndex,
              discarded,
              state.callsEnabled,
              state.rinshanTiles.length > 0 && state.kanDoraIndicators.length > 0,
            )
          : [],
    },
    rinshanPlayerIndex: null,
  };
  return continueAfterDiscard(reactionState);
}

export function passRon(state: GameState, playerIndex: number): GameState {
  if (state.phase !== "reaction" || !state.pendingDiscard) return state;
  if (state.pendingDiscard.ronCandidateIndices[0] !== playerIndex) return state;

  const players = clonePlayers(state.players);
  players[playerIndex].temporaryFuriten = true;
  const pendingDiscard = {
    ...state.pendingDiscard,
    ronCandidateIndices: state.pendingDiscard.ronCandidateIndices.slice(1),
  };
  return continueAfterDiscard({ ...state, players, pendingDiscard });
}

export function passCall(state: GameState, playerIndex: number): GameState {
  const activeOptions = currentCallOptions(state);
  if (activeOptions.length === 0 || activeOptions[0].playerIndex !== playerIndex) {
    return state;
  }
  const pendingDiscard = {
    ...state.pendingDiscard!,
    callOptions: state.pendingDiscard!.callOptions.filter(
      (option) => option.playerIndex !== playerIndex,
    ),
  };
  return continueAfterDiscard({ ...state, pendingDiscard });
}

function kuikaeKeys(option: CallOption, calledTile: Tile): string[] {
  const forbidden = new Set([tileTypeKey(calledTile)]);
  if (option.type === "chi" && option.sequenceStart !== undefined) {
    if (calledTile.rank === option.sequenceStart && option.sequenceStart + 3 <= 9) {
      forbidden.add(`${calledTile.suit}-${option.sequenceStart + 3}`);
    }
    if (calledTile.rank === option.sequenceStart + 2 && option.sequenceStart - 1 >= 1) {
      forbidden.add(`${calledTile.suit}-${option.sequenceStart - 1}`);
    }
  }
  return [...forbidden];
}

export function declareCall(state: GameState, optionId: string): GameState {
  const option = currentCallOptions(state).find(
    (candidate) => candidate.id === optionId,
  );
  if (!option || !state.pendingDiscard) return state;

  const players = clonePlayers(state.players);
  const caller = players[option.playerIndex];
  const consumed = option.consumedTileIds.map((tileId) =>
    caller.hand.find((tile) => tile.id === tileId),
  );
  if (consumed.some((tile) => !tile)) return state;

  const consumedIds = new Set(option.consumedTileIds);
  caller.hand = sortTiles(caller.hand.filter((tile) => !consumedIds.has(tile.id)));
  caller.melds.push({
    id: `meld-${state.turnNumber}-${option.id}`,
    type: option.type,
    tiles: sortTiles([...consumed.map((tile) => tile!), state.pendingDiscard.tile]),
    calledTileId: state.pendingDiscard.tile.id,
    fromPlayerIndex: state.pendingDiscard.playerIndex,
  });
  caller.drawnTile = null;
  caller.mustDiscardAfterCall = option.type !== "kan-open";
  caller.forbiddenDiscardKeys = option.type === "kan-open"
    ? []
    : kuikaeKeys(option, state.pendingDiscard.tile);
  caller.temporaryFuriten = false;
  players.forEach((player) => {
    player.ippatsuEligible = false;
  });

  const discarder = players[state.pendingDiscard.playerIndex];
  const discardIndex = discarder.discards.findLastIndex(
    (tile) => tile.id === state.pendingDiscard!.tile.id,
  );
  if (discardIndex >= 0) discarder.discards.splice(discardIndex, 1);

  const calledState: GameState = {
    ...state,
    phase: "playing",
    players,
    currentPlayerIndex: option.playerIndex,
    pendingDiscard: null,
    rinshanPlayerIndex: null,
  };
  return option.type === "kan-open"
    ? completeKanDraw(calledState, players, option.playerIndex)
    : calledState;
}

export function declareRon(state: GameState, playerIndex: number): GameState {
  if (state.phase !== "reaction" || !state.pendingDiscard) return state;
  if (state.pendingDiscard.ronCandidateIndices[0] !== playerIndex) return state;
  const winner = state.players[playerIndex];
  const value = ronValue(winner, state.pendingDiscard.tile, state.roundWind, {
    houtei:
      state.pendingDiscard.source !== "added-kan" &&
      state.wall.length === 0,
    chankan: state.pendingDiscard.source === "added-kan",
    doraIndicators: state.doraIndicators,
    uraDoraIndicators: state.uraDoraIndicators,
  });
  if (!value || isPlayerFuriten(winner)) return state;
  const scoreResult = settleScore(value, {
    winnerIndex: playerIndex,
    loserIndex: state.pendingDiscard.playerIndex,
    dealerIndex: state.dealerIndex,
    playerCount: state.players.length,
    honba: state.honba,
    riichiSticks: state.riichiSticks,
    winType: "ron",
  });
  const players = clonePlayers(state.players);
  applyPayments(players, scoreResult.payments);

  return {
    ...state,
    phase: "won",
    players,
    winnerIndex: playerIndex,
    loserIndex: state.pendingDiscard.playerIndex,
    winType: "ron",
    winningTile: state.pendingDiscard.tile,
    winningYaku: scoreResult.yaku.map((yaku) => yaku.name),
    scoreResult,
    riichiSticks: 0,
    pendingDiscard: null,
  };
}

export function declareTsumo(state: GameState): GameState {
  if (state.phase !== "playing") return state;
  const current = state.players[state.currentPlayerIndex];
  if (!current.drawnTile) return state;
  const winningTiles = [...current.hand, current.drawnTile];
  const rinshan = state.rinshanPlayerIndex === state.currentPlayerIndex;
  const value = evaluateHand(winningTiles, {
    winType: "tsumo",
    winningTile: current.drawnTile,
    playerSeat: current.seat,
    roundSeat: state.roundWind,
    riichi: current.riichi,
    melds: current.melds,
    ippatsu: current.ippatsuEligible,
    haitei: state.wall.length === 0 && !rinshan,
    rinshan,
    doraIndicators: state.doraIndicators,
    uraDoraIndicators: state.uraDoraIndicators,
  });
  if (!value) return state;
  const scoreResult = settleScore(value, {
    winnerIndex: state.currentPlayerIndex,
    loserIndex: null,
    dealerIndex: state.dealerIndex,
    playerCount: state.players.length,
    honba: state.honba,
    riichiSticks: state.riichiSticks,
    winType: "tsumo",
  });
  const players = clonePlayers(state.players);
  applyPayments(players, scoreResult.payments);
  return {
    ...state,
    phase: "won",
    players,
    winnerIndex: state.currentPlayerIndex,
    loserIndex: null,
    winType: "tsumo",
    winningTile: current.drawnTile,
    winningYaku: scoreResult.yaku.map((yaku) => yaku.name),
    scoreResult,
    riichiSticks: 0,
    pendingDiscard: null,
  };
}

function dealerContinues(state: GameState): boolean {
  if (state.phase === "won") return state.winnerIndex === state.dealerIndex;
  if (state.phase === "exhausted") {
    return state.drawResult?.tenpaiIndices.includes(state.dealerIndex) ?? false;
  }
  return false;
}

export type MatchEndReason = "scheduled" | "bankruptcy";

export function getMatchEndReason(state: GameState): MatchEndReason | null {
  if (state.phase !== "won" && state.phase !== "exhausted") return null;
  if (
    state.bankruptcyEnabled &&
    state.players.some((player) => player.points < 0)
  ) {
    return "bankruptcy";
  }

  const finalWind: RoundWind = state.matchType === "full" ? "北" : "南";
  return state.roundWind === finalWind &&
    state.handNumber === 4 &&
    !dealerContinues(state)
    ? "scheduled"
    : null;
}

export function isMatchComplete(state: GameState): boolean {
  return getMatchEndReason(state) !== null;
}

export function isHanchanComplete(state: GameState): boolean {
  return state.matchType === "hanchan" && isMatchComplete(state);
}

export function advanceToNextHand(
  state: GameState,
  random: RandomSource = Math.random,
): GameState {
  if (state.phase !== "won" && state.phase !== "exhausted") return state;
  if (isMatchComplete(state)) return state;

  const continues = dealerContinues(state);
  const dealerIndex = continues
    ? state.dealerIndex
    : (state.dealerIndex + 1) % state.players.length;
  let roundWind = state.roundWind;
  let handNumber = state.handNumber;

  if (!continues) {
    if (handNumber < 4) {
      handNumber = (handNumber + 1) as HandNumber;
    } else {
      const windIndex = ROUND_WINDS.indexOf(roundWind);
      roundWind = ROUND_WINDS[Math.min(windIndex + 1, ROUND_WINDS.length - 1)];
      handNumber = 1;
    }
  }

  const honba =
    state.phase === "exhausted" || continues ? state.honba + 1 : 0;
  const {
    players,
    wall,
    deadWall,
    rinshanTiles,
    doraIndicators,
    uraDoraIndicators,
    kanDoraIndicators,
    kanUraDoraIndicators,
  } = dealHand(state.players, dealerIndex, random);

  return {
    phase: "playing",
    round: roundLabel(roundWind, handNumber),
    roundWind,
    handNumber,
    dealerIndex,
    wall,
    deadWall,
    rinshanTiles,
    doraIndicators,
    uraDoraIndicators,
    kanDoraIndicators,
    kanUraDoraIndicators,
    players,
    currentPlayerIndex: dealerIndex,
    turnNumber: 1,
    honba,
    riichiSticks: state.riichiSticks,
    pendingDiscard: null,
    winnerIndex: null,
    loserIndex: null,
    winType: null,
    winningTile: null,
    winningYaku: [],
    scoreResult: null,
    drawResult: null,
    matchType: state.matchType,
    bankruptcyEnabled: state.bankruptcyEnabled,
    callsEnabled: state.callsEnabled,
    rinshanPlayerIndex: null,
  };
}
