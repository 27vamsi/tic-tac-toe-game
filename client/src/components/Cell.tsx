interface CellProps {
  value: number;
  onClick: () => void;
  disabled: boolean;
  isWinning?: boolean;
}

export function Cell({ value, onClick, disabled, isWinning }: CellProps) {
  const mark = value === 1 ? "X" : value === 2 ? "O" : "";
  const markClass = value === 1 ? "cell-x" : value === 2 ? "cell-o" : "";

  return (
    <button
      className={`cell ${markClass} ${isWinning ? "cell-winning" : ""}`}
      onClick={onClick}
      disabled={disabled || value !== 0}
    >
      {mark}
    </button>
  );
}
