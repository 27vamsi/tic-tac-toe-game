import { Cell } from "./Cell";

interface BoardProps {
  board: number[];
  onCellClick: (position: number) => void;
  disabled: boolean;
  winningLine?: number[];
}

export function Board({ board, onCellClick, disabled, winningLine }: BoardProps) {
  return (
    <div className="board">
      {board.map((value, i) => (
        <Cell
          key={i}
          value={value}
          onClick={() => onCellClick(i)}
          disabled={disabled}
          isWinning={winningLine?.includes(i)}
        />
      ))}
    </div>
  );
}
