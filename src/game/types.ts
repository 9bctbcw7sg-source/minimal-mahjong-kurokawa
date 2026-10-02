export type Suit = "man" | "pin" | "sou" | "honor";

export interface Tile {
  id: string;
  suit: Suit;
  rank: number;
  copy: number;
}

export type Seat = "東" | "南" | "西" | "北";
export type RoundWind = Seat;
export type HandNumber = 1 | 2 | 3 | 4;
export type MatchType = "hanchan" | "full";

export interface MatchRules {
  matchType: MatchType;
  bankruptcyEnabled: boolean;
}

export type MeldType = "chi" | "pon" | "kan-open" | "kan-closed" | "kan-added";
export type CallType = "chi" | "pon" | "kan-open";

export interface Meld {
  id: string;
  type: MeldType;
  tiles: Tile[];
  calledTileId: string | null;
  fromPlayerIndex: number | null;
}

export interface CallOption {
  id: string;
  type: CallType;
  playerIndex: number;
  consumedTileIds: string[];
  sequenceStart?: number;
}

export interface KanOption {
  id: string;
  type: "kan-closed" | "kan-added";
  playerIndex: number;
  consumedTileIds: string[];
  meldId?: string;
}

export interface PlayerState {
  id: string;
  name: string;
  seat: Seat;
  isHuman: boolean;
  hand: Tile[];
  drawnTile: Tile | null;
  discards: Tile[];
  melds: Meld[];
  mustDiscardAfterCall: boolean;
  forbiddenDiscardKeys: string[];
  riichi: boolean;
  ippatsuEligible: boolean;
  riichiDiscardIndex: number | null;
  temporaryFuriten: boolean;
  points: number;
}

export interface YakuValue {
  name: string;
  han: number;
  yakuman?: number;
}

export interface HandValue {
  yaku: YakuValue[];
  han: number;
  fu: number;
  yakuman: number;
  limitName: string | null;
  basePoints: number;
}

export interface ScoreResult extends HandValue {
  payments: number[];
  totalPoints: number;
}

export interface PendingDiscard {
  tile: Tile;
  playerIndex: number;
  ronCandidateIndices: number[];
  callOptions: CallOption[];
  source?: "discard" | "added-kan";
  kanMeldId?: string;
}

export interface DrawResult {
  tenpaiIndices: number[];
  payments: number[];
}

export type RoundPhase = "playing" | "reaction" | "exhausted" | "won";

export interface GameState {
  phase: RoundPhase;
  round: string;
  roundWind: RoundWind;
  handNumber: HandNumber;
  dealerIndex: number;
  wall: Tile[];
  deadWall: Tile[];
  rinshanTiles: Tile[];
  doraIndicators: Tile[];
  uraDoraIndicators: Tile[];
  kanDoraIndicators: Tile[];
  kanUraDoraIndicators: Tile[];
  players: PlayerState[];
  currentPlayerIndex: number;
  turnNumber: number;
  honba: number;
  riichiSticks: number;
  pendingDiscard: PendingDiscard | null;
  winnerIndex: number | null;
  loserIndex: number | null;
  winType: "tsumo" | "ron" | null;
  winningTile: Tile | null;
  winningYaku: string[];
  scoreResult: ScoreResult | null;
  drawResult: DrawResult | null;
  matchType: MatchType;
  bankruptcyEnabled: boolean;
  callsEnabled: boolean;
  rinshanPlayerIndex: number | null;
}
