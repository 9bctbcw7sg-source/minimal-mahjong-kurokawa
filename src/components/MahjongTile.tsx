import { tileLabel } from "@/src/game/tiles";
import type { Tile } from "@/src/game/types";

const MAN_NUMERALS = ["一", "二", "三", "四", "五", "六", "七", "八", "九"];
const HONOR_GLYPHS = ["東", "南", "西", "北", "白", "發", "中"];

const PATTERN_POSITIONS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
  7: [0, 2, 3, 4, 5, 6, 8],
  8: [0, 1, 2, 3, 5, 6, 7, 8],
  9: [0, 1, 2, 3, 4, 5, 6, 7, 8],
};

function TileArtwork({ tile }: { tile: Tile }) {
  if (tile.suit === "man") {
    return (
      <span className="tile-art tile-art-man" aria-hidden="true">
        <span className="man-numeral">{MAN_NUMERALS[tile.rank - 1]}</span>
        <span className="man-suit">萬</span>
      </span>
    );
  }

  if (tile.suit === "pin") {
    return (
      <span className={`tile-art tile-art-pin pin-${tile.rank}`} aria-hidden="true">
        {PATTERN_POSITIONS[tile.rank].map((position, index) => (
          <span
            key={position}
            className={`pip pip-tone-${(index + tile.rank) % 3}`}
            style={{
              gridColumn: (position % 3) + 1,
              gridRow: Math.floor(position / 3) + 1,
            }}
          />
        ))}
      </span>
    );
  }

  if (tile.suit === "sou") {
    return (
      <span className={`tile-art tile-art-sou sou-${tile.rank}`} aria-hidden="true">
        {PATTERN_POSITIONS[tile.rank].map((position, index) => (
          <span
            key={position}
            className={`bamboo bamboo-tone-${(index + tile.rank) % 3}`}
            style={{
              gridColumn: (position % 3) + 1,
              gridRow: Math.floor(position / 3) + 1,
            }}
          />
        ))}
      </span>
    );
  }

  const honorClass =
    tile.rank === 7
      ? "honor-red"
      : tile.rank === 6
        ? "honor-green"
        : tile.rank === 5
          ? "honor-white"
          : "honor-wind";
  return (
    <span className={`tile-art tile-art-honor ${honorClass}`} aria-hidden="true">
      {HONOR_GLYPHS[tile.rank - 1]}
    </span>
  );
}

interface MahjongTileProps {
  tile?: Tile;
  hidden?: boolean;
  compact?: boolean;
  disabled?: boolean;
  onSelect?: (tile: Tile) => void;
  testId?: string;
  riichiCandidate?: boolean;
}

export function MahjongTile({
  tile,
  hidden = false,
  compact = false,
  disabled = false,
  onSelect,
  testId,
  riichiCandidate = false,
}: MahjongTileProps) {
  if (hidden || !tile) {
    return <span className={`tile tile-back${compact ? " tile-compact" : ""}`} />;
  }

  const content = <TileArtwork tile={tile} />;
  const tileType = `${tile.suit}-${tile.rank}`;

  if (onSelect) {
    return (
      <button
        type="button"
        className={`tile tile-face${compact ? " tile-compact" : ""}${riichiCandidate ? " is-riichi-candidate" : ""}`}
        aria-label={`${tileLabel(tile)}を捨てる`}
        disabled={disabled}
        onClick={() => onSelect(tile)}
        data-testid={testId}
        data-tile-type={tileType}
      >
        {content}
      </button>
    );
  }

  return (
    <span
      className={`tile tile-face${compact ? " tile-compact" : ""}`}
      aria-label={tileLabel(tile)}
      data-tile-type={tileType}
    >
      {content}
    </span>
  );
}
