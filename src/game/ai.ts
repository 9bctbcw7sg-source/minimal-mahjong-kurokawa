import { tileTypeKey } from "./tiles";
import { findRiichiOptions, isWinningHand } from "./hand";
import type { CallOption, GameState, Tile } from "./types";
import {
  currentCallOptions,
  declareKan,
  declareTsumo,
  discardTile,
  findKanOptions,
  type RandomSource,
} from "./state";

function usefulness(tile: Tile, tiles: Tile[]): number {
  const same = tiles.filter(
    (candidate) => tileTypeKey(candidate) === tileTypeKey(tile),
  ).length;
  const neighbors =
    tile.suit === "honor"
      ? 0
      : tiles.filter(
          (candidate) =>
            candidate.suit === tile.suit &&
            Math.abs(candidate.rank - tile.rank) <= 2 &&
            candidate.id !== tile.id,
        ).length;
  return same * 3 + neighbors;
}

export function chooseAiDiscard(
  hand: Tile[],
  drawnTile: Tile,
  random: RandomSource = Math.random,
): Tile {
  const legalTiles = [...hand, drawnTile];
  const ranked = legalTiles
    .map((tile) => ({ tile, score: usefulness(tile, legalTiles) }))
    .sort((a, b) => a.score - b.score);
  const lowestScore = ranked[0].score;
  const candidates = ranked.filter((entry) => entry.score === lowestScore);
  return candidates[Math.floor(random() * candidates.length)].tile;
}

export function playAiTurn(
  state: GameState,
  random: RandomSource = Math.random,
): GameState {
  const player = state.players[state.currentPlayerIndex];
  if (state.phase !== "playing" || player.isHuman) {
    return state;
  }

  if (player.mustDiscardAfterCall && !player.drawnTile) {
    const legalTiles = player.hand.filter(
      (tile) => !player.forbiddenDiscardKeys.includes(tileTypeKey(tile)),
    );
    if (legalTiles.length === 0) return state;
    const ranked = legalTiles
      .map((tile) => ({ tile, score: usefulness(tile, player.hand) }))
      .sort((a, b) => a.score - b.score);
    return discardTile(state, ranked[0].tile.id);
  }

  if (!player.drawnTile) return state;

  if (isWinningHand([...player.hand, player.drawnTile], player.melds.length)) {
    const won = declareTsumo(state);
    if (won.phase === "won") return won;
  }

  const kanOptions = findKanOptions(state);
  if (kanOptions.length > 0 && random() < 0.72) {
    return declareKan(state, kanOptions[0].id);
  }

  if (player.riichi) return discardTile(state, player.drawnTile.id);

  const isClosed = player.melds.every((meld) => meld.type === "kan-closed");
  const riichiOptions = isClosed
    ? findRiichiOptions([...player.hand, player.drawnTile], player.melds.length)
    : [];
  if (player.points >= 1_000 && riichiOptions.length > 0) {
    const option = riichiOptions[Math.floor(random() * riichiOptions.length)];
    return discardTile(state, option.discardId, true);
  }
  const choice = chooseAiDiscard(player.hand, player.drawnTile, random);
  return discardTile(state, choice.id);
}

export function chooseAiCallOption(
  state: GameState,
  random: RandomSource = Math.random,
): CallOption | null {
  const options = currentCallOptions(state);
  if (options.length === 0) return null;
  const tile = state.pendingDiscard?.tile;
  if (!tile) return null;
  const player = state.players[options[0].playerIndex];
  const seatRank = { 東: 1, 南: 2, 西: 3, 北: 4 }[player.seat];
  const roundRank = { 東: 1, 南: 2, 西: 3, 北: 4 }[state.roundWind];

  const valueHonorCall = options.find(
    (option) =>
      (option.type === "pon" || option.type === "kan-open") &&
      tile.suit === "honor" &&
      (tile.rank >= 5 || tile.rank === seatRank || tile.rank === roundRank),
  );
  if (valueHonorCall) return valueHonorCall;

  const openKan = options.find((option) => option.type === "kan-open");
  if (openKan && random() < 0.46) return openKan;

  const pon = options.find((option) => option.type === "pon");
  if (pon && random() < 0.34) return pon;

  const chi = options.find((option) => option.type === "chi");
  if (chi && random() < 0.18) return chi;
  return null;
}
