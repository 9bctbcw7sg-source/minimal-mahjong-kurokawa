import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GameTable } from "../../src/components/GameTable";
import { createInitialGame } from "../../src/game/state";

describe("リーチ表示", () => {
  it("鳴き候補と公開した面子を手牌の近くに描画する", () => {
    const game = createInitialGame(() => 0.42);
    const meldTiles = game.players[0].hand.slice(0, 3);
    game.players[0].melds.push({
      id: "test-chi",
      type: "chi",
      tiles: meldTiles,
      calledTileId: meldTiles[0].id,
      fromPlayerIndex: 3,
    });

    const markup = renderToStaticMarkup(
      <GameTable
        game={game}
        onDiscard={() => {}}
        riichiMode={false}
        riichiCandidateIds={new Set()}
        showRiichiAction={false}
        onRiichi={() => {}}
        showRonAction={false}
        onRon={() => {}}
        onPassRon={() => {}}
        callOptions={[
          {
            id: "chi-option",
            type: "chi",
            playerIndex: 0,
            consumedTileIds: [],
            sequenceStart: 2,
          },
        ]}
      />,
    );

    expect(markup).toContain("鳴きの選択");
    expect(markup).toContain("チー 2・3・4");
    expect(markup).toContain("あなたの副露");
    expect(markup).toContain("called-tile");
  });

  it("各家の持ち点と本場・供託を描画する", () => {
    const game = createInitialGame(() => 0.42);
    const markup = renderToStaticMarkup(
      <GameTable
        game={game}
        onDiscard={() => {}}
        riichiMode={false}
        riichiCandidateIds={new Set()}
        showRiichiAction={false}
        onRiichi={() => {}}
        showRonAction={false}
        onRon={() => {}}
        onPassRon={() => {}}
      />,
    );

    expect(markup.match(/25,000/g)).toHaveLength(4);
    expect(markup).toContain("0本場・供託 0");
  });

  it("流局時はテンパイした相手の手牌だけを公開する", () => {
    const game = createInitialGame(() => 0.42);
    game.phase = "exhausted";
    game.drawResult = {
      tenpaiIndices: [1],
      payments: [0, 0, 0, 0],
    };

    const markup = renderToStaticMarkup(
      <GameTable
        game={game}
        onDiscard={() => {}}
        riichiMode={false}
        riichiCandidateIds={new Set()}
        showRiichiAction={false}
        onRiichi={() => {}}
        showRonAction={false}
        onRon={() => {}}
        onPassRon={() => {}}
      />,
    );

    expect(markup.match(/class="opponent-hand is-revealed"/g)).toHaveLength(1);
    expect(markup).toContain("南家の公開手牌");
    expect(markup).toContain("西家の手牌");
  });

  it("宣言表示、横向き宣言牌、候補牌を描画する", () => {
    const game = createInitialGame(() => 0.42);
    const human = game.players[0];
    const declared = human.hand[0];
    human.discards.push(declared);
    human.riichi = true;
    human.riichiDiscardIndex = 0;
    const candidateId = human.drawnTile!.id;

    const markup = renderToStaticMarkup(
      <GameTable
        game={game}
        onDiscard={() => {}}
        riichiMode
        riichiCandidateIds={new Set([candidateId])}
        showRiichiAction={false}
        onRiichi={() => {}}
        showRonAction={false}
        onRon={() => {}}
        onPassRon={() => {}}
      />,
    );

    expect(markup).toContain("has-riichi");
    expect(markup).toContain("リーチ中");
    expect(markup).toContain("riichi-discard");
    expect(markup).toContain("is-riichi-candidate");
  });

  it("リーチ操作を手牌の近くに明確な文言で描画する", () => {
    const game = createInitialGame(() => 0.42);

    const markup = renderToStaticMarkup(
      <GameTable
        game={game}
        onDiscard={() => {}}
        riichiMode={false}
        riichiCandidateIds={new Set()}
        showRiichiAction
        onRiichi={() => {}}
        showRonAction={false}
        onRon={() => {}}
        onPassRon={() => {}}
      />,
    );

    expect(markup).toContain("human-player-meta");
    expect(markup).toContain("リーチを宣言");
  });

  it("ツモ操作を手牌直上の固定操作帯へ描画する", () => {
    const game = createInitialGame(() => 0.42);
    const markup = renderToStaticMarkup(
      <GameTable
        game={game}
        onDiscard={() => {}}
        riichiMode={false}
        riichiCandidateIds={new Set()}
        showRiichiAction={false}
        onRiichi={() => {}}
        showRonAction={false}
        onRon={() => {}}
        onPassRon={() => {}}
        showTsumoAction
      />,
    );

    expect(markup).toContain("human-decision-actions");
    expect(markup).toContain('data-testid="tsumo-button"');
  });

  it("暗槓は4枚組の両端を伏せて描画する", () => {
    const game = createInitialGame(() => 0.42);
    const tiles = game.players[0].hand.slice(0, 4);
    game.players[0].melds = [{
      id: "test-closed-kan",
      type: "kan-closed",
      tiles,
      calledTileId: null,
      fromPlayerIndex: null,
    }];
    const markup = renderToStaticMarkup(
      <GameTable
        game={game}
        onDiscard={() => {}}
        riichiMode={false}
        riichiCandidateIds={new Set()}
        showRiichiAction={false}
        onRiichi={() => {}}
        showRonAction={false}
        onRon={() => {}}
        onPassRon={() => {}}
      />,
    );

    expect(markup).toContain('data-meld-type="kan-closed"');
    expect(markup.match(/closed-kan-tile/g)).toHaveLength(2);
  });

  it("ロンと見送りを手牌の近くに描画する", () => {
    const game = createInitialGame(() => 0.42);

    const markup = renderToStaticMarkup(
      <GameTable
        game={game}
        onDiscard={() => {}}
        riichiMode={false}
        riichiCandidateIds={new Set()}
        showRiichiAction={false}
        onRiichi={() => {}}
        showRonAction
        onRon={() => {}}
        onPassRon={() => {}}
      />,
    );

    expect(markup).toContain("ロンの選択");
    expect(markup).toContain("ロン");
    expect(markup).toContain("見送る");
  });

  it("ツモ和了後は相手三家の手牌を公開する", () => {
    const game = createInitialGame(() => 0.42);
    game.phase = "won";
    game.winnerIndex = 1;
    game.winType = "tsumo";
    game.players[1].drawnTile = game.wall.pop()!;

    const markup = renderToStaticMarkup(
      <GameTable
        game={game}
        onDiscard={() => {}}
        riichiMode={false}
        riichiCandidateIds={new Set()}
        showRiichiAction={false}
        onRiichi={() => {}}
        showRonAction={false}
        onRon={() => {}}
        onPassRon={() => {}}
      />,
    );

    expect(markup.match(/class="opponent-hand is-revealed"/g)).toHaveLength(3);
    expect(markup).toContain("南家の公開手牌 14枚");
    expect(markup).toContain("opponent-drawn-tile");
  });

  it("ロン和了牌を勝者の手牌から離して公開する", () => {
    const game = createInitialGame(() => 0.42);
    game.phase = "won";
    game.winnerIndex = 1;
    game.loserIndex = 0;
    game.winType = "ron";
    game.winningTile = game.players[0].drawnTile;
    game.players[0].drawnTile = null;
    game.players[0].discards.push(game.winningTile!);
    game.winningYaku = ["リーチ"];

    const markup = renderToStaticMarkup(
      <GameTable
        game={game}
        onDiscard={() => {}}
        riichiMode={false}
        riichiCandidateIds={new Set()}
        showRiichiAction={false}
        onRiichi={() => {}}
        showRonAction={false}
        onRon={() => {}}
        onPassRon={() => {}}
      />,
    );

    expect(markup).toContain("南家 ロン和了");
    expect(markup).toContain("南家の公開手牌 14枚");
    expect(markup).toContain("opponent-drawn-tile");
    expect(markup).toContain("ron-discard");
  });
});
