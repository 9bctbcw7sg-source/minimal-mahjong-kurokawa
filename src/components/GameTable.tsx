import type {
  CallOption,
  GameState,
  KanOption,
  PlayerState,
  Tile,
} from "@/src/game/types";
import { tileLabel, tileTypeKey } from "@/src/game/tiles";
import { MahjongTile } from "./MahjongTile";

interface GameTableProps {
  game: GameState;
  onDiscard: (tile: Tile) => void;
  riichiMode: boolean;
  riichiCandidateIds: Set<string>;
  showRiichiAction: boolean;
  onRiichi: () => void;
  showRonAction: boolean;
  onRon: () => void;
  onPassRon: () => void;
  showTsumoAction?: boolean;
  onTsumo?: () => void;
  callOptions?: CallOption[];
  onCall?: (optionId: string) => void;
  onPassCall?: () => void;
  kanOptions?: KanOption[];
  onKan?: (optionId: string) => void;
}

function OpenMelds({ player }: { player: PlayerState }) {
  if (player.melds.length === 0) return null;
  return (
    <div className="open-melds" aria-label={`${player.name}の副露`}>
      {player.melds.map((meld) => (
        <div className="open-meld" key={meld.id} data-meld-type={meld.type}>
          {meld.tiles.map((tile, index) => (
            <span
              key={tile.id}
              className={[
                tile.id === meld.calledTileId ? "called-tile" : "",
                meld.type === "kan-closed" && (index === 0 || index === 3)
                  ? "closed-kan-tile"
                  : "",
              ].filter(Boolean).join(" ") || undefined}
            >
              <MahjongTile
                tile={tile}
                hidden={meld.type === "kan-closed" && (index === 0 || index === 3)}
                compact
              />
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

const POSITION_CLASS = ["player-bottom", "player-right", "player-top", "player-left"];

function OpponentHand({
  player,
  revealed,
  winningTile,
}: {
  player: PlayerState;
  revealed: boolean;
  winningTile: Tile | null;
}) {
  const count =
    player.hand.length + (player.drawnTile || winningTile ? 1 : 0);

  if (revealed) {
    return (
      <div
        className="opponent-hand is-revealed"
        aria-label={`${player.name}の公開手牌 ${count}枚`}
      >
        {player.hand.map((tile) => (
          <MahjongTile key={tile.id} tile={tile} compact />
        ))}
        {(player.drawnTile || winningTile) && (
          <span className="opponent-drawn-tile">
            <MahjongTile tile={player.drawnTile ?? winningTile!} compact />
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="opponent-hand" aria-label={`${player.name}の手牌 ${count}枚`}>
      {Array.from({ length: count }, (_, index) => (
        <MahjongTile key={index} hidden compact />
      ))}
    </div>
  );
}

function River({
  player,
  ronTileId,
}: {
  player: PlayerState;
  ronTileId: string | null;
}) {
  return (
    <div
      className={`river river-${player.id}`}
      aria-label={`${player.name}の河`}
      data-testid={player.isHuman ? "human-river" : undefined}
    >
      {player.discards.map((tile, index) => {
        const classes = [
          index === player.riichiDiscardIndex ? "riichi-discard" : "",
          tile.id === ronTileId ? "ron-discard" : "",
        ]
          .filter(Boolean)
          .join(" ");
        return (
          <span key={tile.id} className={classes || undefined}>
            <MahjongTile tile={tile} compact />
          </span>
        );
      })}
    </div>
  );
}

function PlayerLabel({ player, active }: { player: PlayerState; active: boolean }) {
  return (
    <div
      className={`player-label${active ? " is-active" : ""}${player.riichi ? " has-riichi" : ""}`}
    >
      <span className="seat-mark">{player.seat}</span>
      <span className="player-name-score">
        <span>{player.name}</span>
        <b data-testid={`points-${player.id}`}>
          {player.points.toLocaleString("ja-JP")}
        </b>
      </span>
      {player.riichi && <span className="sr-only">リーチ中</span>}
    </div>
  );
}

export function GameTable({
  game,
  onDiscard,
  riichiMode,
  riichiCandidateIds,
  showRiichiAction,
  onRiichi,
  showRonAction,
  onRon,
  onPassRon,
  showTsumoAction = false,
  onTsumo = () => undefined,
  callOptions = [],
  onCall = () => undefined,
  onPassCall = () => undefined,
  kanOptions = [],
  onKan = () => undefined,
}: GameTableProps) {
  const human = game.players[0];
  const canDiscard =
    game.phase === "playing" &&
    game.currentPlayerIndex === 0 &&
    (!!human.drawnTile || human.mustDiscardAfterCall);
  const humanExtraTile =
    human.drawnTile ??
    (game.phase === "won" && game.winType === "ron" && game.winnerIndex === 0
      ? game.winningTile
      : null);
  const activePlayerIndex =
    game.phase === "won" ? game.winnerIndex : game.currentPlayerIndex;
  const revealUraDora =
    game.phase === "won" &&
    game.winnerIndex !== null &&
    game.players[game.winnerIndex].riichi;

  return (
    <section className="table-shell" data-testid="game-table" aria-label="麻雀卓">
      <div className="table-felt">
        {game.players.map((player, index) => (
          <div key={player.id} className={`player-zone ${POSITION_CLASS[index]}`}>
            {player.isHuman ? (
              <div className="human-player-meta">
                <PlayerLabel player={player} active={activePlayerIndex === index} />
                <div className="human-decision-actions">
                  {showTsumoAction && (
                    <button
                      type="button"
                      className="win-button"
                      onClick={onTsumo}
                      data-testid="tsumo-button"
                    >
                      ツモ
                    </button>
                  )}
                  {showRonAction && (
                    <div className="claim-actions" aria-label="ロンの選択">
                    <button
                      type="button"
                      className="win-button"
                      onClick={onRon}
                      data-testid="ron-button"
                    >
                      ロン
                    </button>
                    <button
                      type="button"
                      className="claim-pass-button"
                      onClick={onPassRon}
                    >
                      見送る
                    </button>
                  </div>
                  )}
                  {callOptions.length > 0 && (
                    <div className="claim-actions call-actions" aria-label="鳴きの選択">
                    {callOptions.map((option) => (
                      <button
                        type="button"
                        className="call-button"
                        key={option.id}
                        onClick={() => onCall(option.id)}
                        data-testid={`${option.type}-button`}
                      >
                        {option.type === "pon"
                          ? "ポン"
                          : option.type === "kan-open"
                            ? "カン"
                            : `チー ${option.sequenceStart}・${option.sequenceStart! + 1}・${option.sequenceStart! + 2}`}
                      </button>
                    ))}
                    <button
                      type="button"
                      className="claim-pass-button"
                      onClick={onPassCall}
                    >
                      見送る
                    </button>
                  </div>
                  )}
                  {kanOptions.map((option) => {
                    const optionTile = [
                      ...human.hand,
                      ...(human.drawnTile ? [human.drawnTile] : []),
                    ].find((tile) => option.consumedTileIds.includes(tile.id)) ??
                      (option.meldId
                        ? human.melds.find((meld) => meld.id === option.meldId)?.tiles[0]
                        : undefined);
                    return (
                      <button
                        type="button"
                        className="call-button kan-button"
                        key={option.id}
                        onClick={() => onKan(option.id)}
                        data-testid="kan-button"
                      >
                        {option.type === "kan-closed" ? "暗槓" : "加槓"}
                        {optionTile ? ` ${tileLabel(optionTile)}` : ""}
                      </button>
                    );
                  })}
                  {showRiichiAction && (
                    <button
                      type="button"
                      className={`riichi-button${riichiMode ? " is-active" : ""}`}
                      onClick={onRiichi}
                      data-testid="riichi-button"
                    >
                      {riichiMode ? "候補牌を選択" : "リーチを宣言"}
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <PlayerLabel player={player} active={activePlayerIndex === index} />
            )}
            {player.isHuman ? (
              <div className="human-hand" data-testid="human-hand">
                <div className="concealed-tiles">
                  {player.hand.map((tile) => (
                    <MahjongTile
                      key={tile.id}
                      tile={tile}
                      disabled={
                        !canDiscard ||
                        player.riichi ||
                        player.forbiddenDiscardKeys.includes(tileTypeKey(tile)) ||
                        (riichiMode && !riichiCandidateIds.has(tile.id))
                      }
                      onSelect={onDiscard}
                      riichiCandidate={riichiMode && riichiCandidateIds.has(tile.id)}
                    />
                  ))}
                </div>
                {humanExtraTile && (
                  <div className="drawn-tile">
                    <MahjongTile
                      tile={humanExtraTile}
                      disabled={
                        !canDiscard ||
                        (riichiMode && !riichiCandidateIds.has(humanExtraTile.id))
                      }
                      onSelect={onDiscard}
                      testId="drawn-tile"
                      riichiCandidate={
                        riichiMode && riichiCandidateIds.has(humanExtraTile.id)
                      }
                    />
                  </div>
                )}
              </div>
            ) : (
              <OpponentHand
                player={player}
                revealed={
                  game.phase === "won" ||
                  (game.phase === "exhausted" &&
                    (game.drawResult?.tenpaiIndices.includes(index) ?? false))
                }
                winningTile={
                  game.phase === "won" &&
                  game.winType === "ron" &&
                  game.winnerIndex === index
                    ? game.winningTile
                    : null
                }
              />
            )}
            <OpenMelds player={player} />
          </div>
        ))}

        <div className="river-grid">
          {game.players.map((player) => (
            <River
              key={player.id}
              player={player}
              ronTileId={
                game.phase === "won" &&
                game.winType === "ron" &&
                game.players[game.loserIndex ?? -1]?.id === player.id
                  ? game.winningTile?.id ?? null
                  : null
              }
            />
          ))}
        </div>

        <div className="round-marker">
          <strong data-testid="round-name">{game.round}</strong>
          <span data-testid="honba-count">{game.honba}本場・供託 {game.riichiSticks}</span>
          <div className="indicator-row" aria-label="ドラ表示牌">
            <span>ドラ</span>
            {game.doraIndicators.map((tile) => (
              <MahjongTile key={tile.id} tile={tile} compact />
            ))}
          </div>
          {revealUraDora && (
            <div className="indicator-row ura-indicator" aria-label="裏ドラ表示牌">
              <span>裏</span>
              {game.uraDoraIndicators.map((tile) => (
                <MahjongTile key={tile.id} tile={tile} compact />
              ))}
            </div>
          )}
          <span>残り <b data-testid="wall-count">{game.wall.length}</b> 枚</span>
          <span data-testid="turn-seat">
            {game.phase === "won"
              ? `${game.players[game.winnerIndex ?? 0].seat}家 ${game.winType === "ron" ? "ロン" : "ツモ"}和了`
              : game.phase === "exhausted"
              ? "流局"
              : game.phase === "reaction"
              ? game.pendingDiscard?.source === "added-kan"
                ? "加槓を確認中"
                : "打牌を確認中"
              : `${game.players[game.currentPlayerIndex].seat}家の手番`}
          </span>
        </div>
      </div>
    </section>
  );
}
