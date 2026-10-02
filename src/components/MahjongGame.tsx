import { useEffect, useMemo, useState } from "react";
import { chooseAiCallOption, playAiTurn } from "@/src/game/ai";
import { createGameAudio } from "@/src/game/audio";
import { findRiichiOptions, findWaits } from "@/src/game/hand";
import { evaluateHand } from "@/src/game/scoring";
import {
  advanceToNextHand,
  createInitialGame,
  currentCallOptions,
  declareCall,
  declareKan,
  declareRon,
  declareTsumo,
  discardTile,
  findKanOptions,
  getMatchEndReason,
  isPlayerFuriten,
  isMatchComplete,
  passRon,
  passCall,
  setCallsEnabled,
} from "@/src/game/state";
import { tileLabel } from "@/src/game/tiles";
import type { GameState, MatchType, Tile } from "@/src/game/types";
import { GameTable } from "./GameTable";
import { MahjongTile } from "./MahjongTile";

const STORAGE_KEY = "kurokawa-settings";

interface Settings {
  aiDelay: number;
  showGuide: boolean;
  soundEnabled: boolean;
  callsEnabled: boolean;
  matchType: MatchType;
  bankruptcyEnabled: boolean;
}

const DEFAULT_SETTINGS: Settings = {
  aiDelay: 360,
  showGuide: true,
  soundEnabled: true,
  callsEnabled: true,
  matchType: "hanchan",
  bankruptcyEnabled: true,
};

export function MahjongGame() {
  const [game, setGame] = useState<GameState | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [riichiMode, setRiichiMode] = useState(false);
  const [settings, setSettings] = useState<Settings>(() => {
    if (typeof window === "undefined") return DEFAULT_SETTINGS;
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) return DEFAULT_SETTINGS;
    try {
      return { ...DEFAULT_SETTINGS, ...(JSON.parse(saved) as Settings) };
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
      return DEFAULT_SETTINGS;
    }
  });
  const audio = useMemo(() => createGameAudio(), []);
  const human = game?.players[0] ?? null;
  const roundWind = game?.roundWind ?? "東";
  const humanHasTurn =
    game?.phase === "playing" &&
    game.currentPlayerIndex === 0 &&
    (!!human?.drawnTile || !!human?.mustDiscardAfterCall);
  const humanTiles = useMemo(
    () => (human?.drawnTile ? [...human.hand, human.drawnTile] : human?.hand ?? []),
    [human],
  );
  const humanTsumoValue = useMemo(
    () =>
      humanHasTurn && human?.drawnTile
        ? evaluateHand(humanTiles, {
            winType: "tsumo",
            winningTile: human.drawnTile,
            playerSeat: human.seat,
            roundSeat: roundWind,
            riichi: human.riichi,
            melds: human.melds,
            ippatsu: human.ippatsuEligible,
            haitei: game.wall.length === 0 && game.rinshanPlayerIndex !== 0,
            rinshan: game.rinshanPlayerIndex === 0,
            doraIndicators: game.doraIndicators,
            uraDoraIndicators: game.uraDoraIndicators,
          })
        : null,
    [game, human, humanHasTurn, humanTiles, roundWind],
  );
  const humanCanTsumo = humanTsumoValue !== null;
  const humanCanRon =
    game?.phase === "reaction" &&
    game.pendingDiscard?.ronCandidateIndices[0] === 0;
  const humanCallOptions = useMemo(
    () => (game ? currentCallOptions(game).filter((option) => option.playerIndex === 0) : []),
    [game],
  );
  const humanKanOptions = useMemo(
    () => game && humanHasTurn && !humanCanTsumo ? findKanOptions(game, 0) : [],
    [game, humanCanTsumo, humanHasTurn],
  );
  const riichiOptions = useMemo(
    () =>
      humanHasTurn &&
      human &&
      human.points >= 1_000 &&
      !human.riichi &&
      human.melds.every((meld) => meld.type === "kan-closed") &&
      !humanCanTsumo
        ? findRiichiOptions(humanTiles, human.melds.length)
        : [],
    [human, humanCanTsumo, humanHasTurn, humanTiles],
  );
  const riichiCandidateIds = useMemo(
    () => new Set(riichiOptions.map((option) => option.discardId)),
    [riichiOptions],
  );
  const humanWaits = useMemo(
    () => (human ? findWaits(human.hand, human.melds.length) : []),
    [human],
  );
  const showHumanWaits =
    !!game &&
    humanWaits.length > 0 &&
    ((game.phase === "playing" &&
      (game.players[0].riichi || !humanHasTurn || humanCanTsumo)) ||
      (game.phase === "reaction" && humanCanRon));
  const humanFuriten = human ? isPlayerFuriten(human) : false;
  const isRoundOver = game?.phase === "won" || game?.phase === "exhausted";
  const matchComplete = game ? isMatchComplete(game) : false;
  const matchEndReason = game ? getMatchEndReason(game) : null;
  const matchName = (game?.matchType ?? settings.matchType) === "full"
    ? "一荘戦"
    : "半荘戦";
  const ranking = useMemo(
    () =>
      game
        ? game.players
            .map((player, index) => ({ player, index }))
            .sort(
              (a, b) =>
                b.player.points - a.player.points || a.index - b.index,
            )
        : [],
    [game],
  );

  useEffect(() => {
    document.documentElement.dataset.kurokawaReady = "true";
    return () => {
      delete document.documentElement.dataset.kurokawaReady;
    };
  }, []);

  useEffect(() => () => audio.dispose(), [audio]);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    if (!game) return;

    if (game.phase === "reaction") {
      const firstCandidate = game.pendingDiscard?.ronCandidateIndices[0];
      if (firstCandidate !== undefined && game.players[firstCandidate].isHuman) {
        return;
      }

      const callOptions = currentCallOptions(game);
      const callPlayerIndex = callOptions[0]?.playerIndex;
      if (
        firstCandidate === undefined &&
        callPlayerIndex !== undefined &&
        game.players[callPlayerIndex].isHuman
      ) {
        return;
      }
      if (firstCandidate === undefined && callPlayerIndex === undefined) return;

      const timer = window.setTimeout(() => {
        setGame((current) => {
          if (!current || current.phase !== "reaction") return current;
          const candidate = current.pendingDiscard?.ronCandidateIndices[0];
          if (candidate !== undefined) {
            if (current.players[candidate].isHuman) return current;
            const next = declareRon(current, candidate);
            if (settings.soundEnabled && next.phase === "won") audio.playRon();
            return next;
          }

          const options = currentCallOptions(current);
          const playerIndex = options[0]?.playerIndex;
          if (playerIndex === undefined || current.players[playerIndex].isHuman) {
            return current;
          }
          const choice = chooseAiCallOption(current);
          const next = choice
            ? declareCall(current, choice.id)
            : passCall(current, playerIndex);
          if (choice && settings.soundEnabled) audio.playCall();
          return next;
        });
      }, settings.aiDelay);

      return () => window.clearTimeout(timer);
    }

    if (game.phase !== "playing") return;
    if (game.players[game.currentPlayerIndex].isHuman) return;

    const timer = window.setTimeout(() => {
      setGame((current) => {
        if (!current) return current;
        const playerIndex = current.currentPlayerIndex;
        const wasRiichi = current.players[playerIndex].riichi;
        const doraCount = current.doraIndicators.length;
        const next = playAiTurn(current);
        if (settings.soundEnabled) {
          const declaredRiichi = !wasRiichi && next.players[playerIndex].riichi;
          if (declaredRiichi) audio.playRiichi();
          else if (next.doraIndicators.length > doraCount) audio.playCall();
          else if (next.phase === "won") audio.playDraw();
          else audio.playDiscard();
        }
        return next;
      });
    }, settings.aiDelay);

    return () => window.clearTimeout(timer);
  }, [audio, game, settings.aiDelay, settings.soundEnabled]);

  function sitAtTable() {
    setGame(
      createInitialGame(Math.random, settings.callsEnabled, {
        matchType: settings.matchType,
        bankruptcyEnabled: settings.bankruptcyEnabled,
      }),
    );
    setRiichiMode(false);
    if (settings.soundEnabled) audio.playDraw();
  }

  function leaveTable() {
    setGame(null);
    setRiichiMode(false);
  }

  function handleDiscard(tile: Tile) {
    setGame((current) => {
      if (!current || current.currentPlayerIndex !== 0) return current;
      if (settings.soundEnabled) {
        if (riichiMode) audio.playRiichi();
        else audio.playDiscard();
      }
      return discardTile(current, tile.id, riichiMode);
    });
    setRiichiMode(false);
  }

  function handleTsumo() {
    setGame((current) => (current ? declareTsumo(current) : current));
    setRiichiMode(false);
  }

  function handleRon() {
    setGame((current) => {
      if (!current) return current;
      const next = declareRon(current, 0);
      if (settings.soundEnabled && next.phase === "won") audio.playRon();
      return next;
    });
    setRiichiMode(false);
  }

  function handlePassRon() {
    setGame((current) => (current ? passRon(current, 0) : current));
    setRiichiMode(false);
  }

  function handleCall(optionId: string) {
    setGame((current) => {
      if (!current) return current;
      const next = declareCall(current, optionId);
      if (settings.soundEnabled && next !== current) audio.playCall();
      return next;
    });
    setRiichiMode(false);
  }

  function handleKan(optionId: string) {
    setGame((current) => {
      if (!current) return current;
      const next = declareKan(current, optionId);
      if (settings.soundEnabled && next !== current) audio.playCall();
      return next;
    });
    setRiichiMode(false);
  }

  function handlePassCall() {
    setGame((current) => (current ? passCall(current, 0) : current));
    setRiichiMode(false);
  }

  function handleNextHand() {
    setGame((current) => (current ? advanceToNextHand(current) : current));
    setRiichiMode(false);
    if (settings.soundEnabled) audio.playDraw();
  }

  return (
    <main className={`app-shell${game ? " has-game" : ""}`}>
      <header className="topbar">
        <div className="brand-block">
          <span className="brand-kicker">MINIMAL MAHJONG</span>
          <h1>ミニマル麻雀 <b>黒川</b></h1>
        </div>
        <nav className="top-actions" aria-label="ゲームメニュー">
          <button type="button" className="quiet-button" onClick={() => setSettingsOpen(true)}>
            設定
          </button>
          {game ? (
            <button type="button" className="quiet-button" onClick={leaveTable}>
              席を立つ
            </button>
          ) : (
            <button type="button" className="primary-button" onClick={sitAtTable} data-testid="sit-button">
              卓につく
            </button>
          )}
        </nav>
      </header>

      {game ? (
        <div
          className={`game-layout${isRoundOver ? " has-subpanel" : ""}${
            matchComplete ? " has-final-ranking" : ""
          }`}
        >
          <div className="status-row">
            <p className="status-text" aria-live="polite">
              {game.phase === "won"
                ? game.winType === "ron"
                  ? `${game.players[game.winnerIndex ?? 0].name}が${game.players[game.loserIndex ?? 0].name}の打牌でロン和了しました。`
                  : `${game.players[game.winnerIndex ?? 0].name}のツモ和了です。`
                : game.phase === "exhausted"
                ? `牌山がなくなりました。${game.round}は流局です。`
                : game.phase === "reaction"
                  ? humanCanRon
                    ? game.pendingDiscard?.source === "added-kan"
                      ? `${game.players[game.pendingDiscard.playerIndex].name}の加槓をロンできます。`
                      : `${game.players[game.pendingDiscard?.playerIndex ?? 0].name}の捨て牌で和了できます。`
                    : humanCallOptions.length > 0
                      ? `${game.players[game.pendingDiscard?.playerIndex ?? 0].name}の捨て牌を鳴けます。`
                      : "捨て牌への反応を確認しています。"
                : humanCanTsumo
                  ? "和了形です。ツモを宣言できます。"
                  : riichiMode
                    ? "リーチする打牌を選んでください。"
                : game.currentPlayerIndex === 0
                  ? game.players[0].mustDiscardAfterCall
                    ? "鳴きました。捨てる牌を選んでください。"
                    : game.players[0].riichi
                    ? "リーチ中です。ツモ牌を確認してください。"
                    : "ツモりました。捨てる牌を選んでください。"
                  : `${game.players[game.currentPlayerIndex].name}${game.players[game.currentPlayerIndex].riichi ? "（リーチ）" : ""}が思考中です。`}
            </p>
            <div className="status-actions">
              <span data-testid="human-discard-count">
                河 {game.players[0].discards.length}枚
              </span>
            </div>
          </div>
          <GameTable
            game={game}
            onDiscard={handleDiscard}
            riichiMode={riichiMode}
            riichiCandidateIds={riichiCandidateIds}
            showRiichiAction={
              !humanCanTsumo && riichiOptions.length > 0 && !game.players[0].riichi
            }
            onRiichi={() => setRiichiMode((active) => !active)}
            showRonAction={humanCanRon}
            onRon={handleRon}
            onPassRon={handlePassRon}
            showTsumoAction={humanCanTsumo}
            onTsumo={handleTsumo}
            callOptions={humanCallOptions}
            onCall={handleCall}
            onPassCall={handlePassCall}
            kanOptions={humanKanOptions}
            onKan={handleKan}
          />
          <div className="human-info-dock">
            {showHumanWaits && (
              <div className="waits-panel" aria-label="現在の待ち牌">
                <span>
                  {humanFuriten
                    ? "フリテン・待ち"
                    : game.players[0].riichi
                      ? "リーチ・待ち"
                      : "テンパイ・待ち"}
                </span>
                <div className="wait-tiles">
                  {humanWaits.map((tile) => (
                    <span key={tile.id} title={tileLabel(tile)}>
                      <MahjongTile tile={tile} compact />
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
          {isRoundOver && (
            <div className="round-actions">
              <div className="result-stack">
                {game.phase === "won" && (
                <div className="win-summary" aria-label="和了結果">
                  <strong>{game.winType === "ron" ? "ロン" : "ツモ"}</strong>
                  <span className="win-yaku">{game.winningYaku.join("・")}</span>
                  {game.scoreResult && (
                    <span className="win-points" data-testid="score-result">
                      {game.scoreResult.yakuman > 0
                        ? game.scoreResult.limitName
                        : `${game.scoreResult.han}翻 ${game.scoreResult.fu}符${
                            game.scoreResult.limitName
                              ? `・${game.scoreResult.limitName}`
                              : ""
                          }`}
                      <b>+{game.scoreResult.totalPoints.toLocaleString("ja-JP")}点</b>
                    </span>
                  )}
                </div>
                )}
                {game.phase === "exhausted" && game.drawResult && (
                  <div className="draw-summary" aria-label="流局結果">
                    <strong>流局</strong>
                    <span>
                      {game.drawResult.tenpaiIndices.length > 0
                        ? `テンパイ ${game.drawResult.tenpaiIndices
                            .map((index) => game.players[index].name)
                            .join("・")}`
                        : "全員ノーテン"}
                    </span>
                    <b>
                      {game.drawResult.tenpaiIndices.length === 0 ||
                      game.drawResult.tenpaiIndices.length === game.players.length
                        ? "点数移動なし"
                        : "ノーテン罰符 3,000点"}
                    </b>
                  </div>
                )}
                {matchComplete && (
                  <div className="final-ranking" aria-label={`${matchName}結果`}>
                    <span>
                      <b>
                        {matchEndReason === "bankruptcy"
                          ? "箱割れ終了"
                          : `${matchName}終了`}
                      </b>
                    </span>
                    {ranking.map(({ player }, index) => (
                      <span key={player.id}>
                        <b>{index + 1}位</b> {player.name} {player.points.toLocaleString("ja-JP")}点
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <button
                type="button"
                className="primary-button"
                onClick={matchComplete ? sitAtTable : handleNextHand}
                data-testid="next-hand-button"
              >
                {matchComplete ? `新しい${matchName}` : "次局へ"}
              </button>
            </div>
          )}
          {settings.showGuide && game.phase === "playing" && (
            <p className="play-guide">
              {riichiMode
                ? "点灯した牌を選ぶと、打牌と同時にリーチします。"
                : game.players[0].mustDiscardAfterCall
                  ? "鳴いたあとは、食い替えに当たらない牌を一枚捨てます。"
                  : "手牌をクリックまたはタップすると、その牌を捨てます。"}
            </p>
          )}
        </div>
      ) : (
        <section className="welcome" aria-labelledby="welcome-title">
          <div className="welcome-copy">
            <p className="eyebrow">{matchName}・四人打ち</p>
            <h2 id="welcome-title">余白のある卓で、<br />静かに一局。</h2>
            <p>
              チー・ポン・カンを交え、役と点数を確かめながら遊べるプロトタイプです。<br />
              あなたが東家、三人の簡易AIが対局します。
            </p>
            <button type="button" className="primary-button large" onClick={sitAtTable}>
              卓につく
            </button>
          </div>
          <div className="welcome-mark" aria-hidden="true">
            <span>東</span><span>南</span><span>西</span><span>北</span>
          </div>
        </section>
      )}

      <footer className="footer-note">音まで静かな麻雀。</footer>

      {settingsOpen && (
        <div className="dialog-backdrop" role="presentation" onMouseDown={() => setSettingsOpen(false)}>
          <section
            className="settings-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="dialog-heading">
              <h2 id="settings-title">設定</h2>
              <button type="button" className="icon-button" onClick={() => setSettingsOpen(false)} aria-label="設定を閉じる">×</button>
            </div>
            <label className="setting-row">
              <span>対局形式</span>
              <select
                value={settings.matchType}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    matchType: event.target.value as MatchType,
                  }))
                }
                data-testid="match-type-setting"
              >
                <option value="hanchan">半荘戦（東・南）</option>
                <option value="full">一荘戦（東・南・西・北）</option>
              </select>
            </label>
            <label className="setting-row check-row">
              <span>箱割れで終了</span>
              <input
                type="checkbox"
                checked={settings.bankruptcyEnabled}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    bankruptcyEnabled: event.target.checked,
                  }))
                }
                data-testid="bankruptcy-setting"
              />
            </label>
            <label className="setting-row">
              <span>AIの速さ</span>
              <select
                value={settings.aiDelay}
                onChange={(event) => setSettings((current) => ({ ...current, aiDelay: Number(event.target.value) }))}
              >
                <option value={700}>ゆっくり</option>
                <option value={360}>ふつう</option>
                <option value={120}>速い</option>
              </select>
            </label>
            <label className="setting-row check-row">
              <span>対局の効果音</span>
              <input
                type="checkbox"
                checked={settings.soundEnabled}
                onChange={(event) => {
                  const soundEnabled = event.target.checked;
                  setSettings((current) => ({ ...current, soundEnabled }));
                  if (soundEnabled) audio.playDiscard();
                }}
              />
            </label>
            <label className="setting-row check-row">
              <span>鳴き（チー・ポン・大明槓）</span>
              <input
                type="checkbox"
                checked={settings.callsEnabled}
                onChange={(event) => {
                  const callsEnabled = event.target.checked;
                  setSettings((current) => ({ ...current, callsEnabled }));
                  setGame((current) =>
                    current ? setCallsEnabled(current, callsEnabled) : current,
                  );
                }}
                data-testid="calls-setting"
              />
            </label>
            <label className="setting-row check-row">
              <span>操作案内を表示</span>
              <input
                type="checkbox"
                checked={settings.showGuide}
                onChange={(event) => setSettings((current) => ({ ...current, showGuide: event.target.checked }))}
              />
            </label>
            <p className="settings-note">
              対局形式と箱割れ設定は、次に卓につくときから反映されます。設定はこのブラウザに保存されます。
            </p>
            <button type="button" className="primary-button dialog-done" onClick={() => setSettingsOpen(false)}>完了</button>
          </section>
        </div>
      )}
    </main>
  );
}
