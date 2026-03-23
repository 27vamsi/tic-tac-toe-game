import type { GameState } from "../hooks/useMatch";
import { Timer } from "./Timer";

interface GameInfoProps {
  gameState: GameState;
  myUserId: string;
}

function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return min > 0 ? `${min}m ${sec}s` : `${sec}s`;
}

export function GameInfo({ gameState, myUserId }: GameInfoProps) {
  const { players, currentTurn, winner, gameOver, turnDeadline, timeSpent, idleWarned, forfeitDeadline } = gameState;
  const myPlayer = players[myUserId];
  const opponentId = Object.keys(players).find((id) => id !== myUserId);
  const opponent = opponentId ? players[opponentId] : null;

  const myMark = myPlayer?.mark === 1 ? "X" : "O";
  const opponentMark = opponent?.mark === 1 ? "X" : "O";

  let status: string;
  if (gameOver) {
    if (winner === "draw") {
      status = "It's a draw!";
    } else if (winner === myUserId) {
      status = "You won!";
    } else {
      status = "You lost!";
    }
  } else if (Object.keys(players).length < 2) {
    status = "Waiting for opponent...";
  } else if (currentTurn === myUserId) {
    status = "Your turn";
  } else {
    status = "Opponent's turn";
  }

  const isMyTurn = currentTurn === myUserId && !gameOver;

  return (
    <div className="game-info">
      <div className="players">
        <div className={`player ${isMyTurn ? "player-active" : ""}`}>
          <span className="player-mark">{myMark}</span>
          <span className="player-name">You ({myPlayer?.username || "..."})</span>
        </div>
        <span className="vs">vs</span>
        <div className={`player ${!isMyTurn && !gameOver && Object.keys(players).length === 2 ? "player-active" : ""}`}>
          <span className="player-mark">{opponentMark}</span>
          <span className="player-name">{opponent?.username || "Waiting..."}</span>
        </div>
      </div>

      <div className={`status ${gameOver ? (winner === myUserId ? "status-win" : winner === "draw" ? "status-draw" : "status-lose") : ""}`}>
        {status}
      </div>

      {!gameOver && Object.keys(players).length === 2 && !idleWarned && (
        <Timer deadline={turnDeadline} active={!gameOver} label="Idle" />
      )}

      {idleWarned && !gameOver && (
        <div className="idle-warning">
          <div className="idle-warning-text">
            {currentTurn === myUserId
              ? "You are idle! Make a move or you will be forfeited!"
              : "Opponent is idle... waiting for their move"}
          </div>
          <Timer deadline={forfeitDeadline} active={!gameOver} label="Forfeit in" urgent />
        </div>
      )}

      {timeSpent && Object.keys(players).length === 2 && (
        <div className="time-spent">
          <span className="time-label">Time:</span>
          <span className="time-value">You {formatTime(timeSpent[myUserId] || 0)}</span>
          <span className="time-separator">|</span>
          <span className="time-value">{opponent?.username || "Opp"} {formatTime(opponentId ? (timeSpent[opponentId] || 0) : 0)}</span>
        </div>
      )}
    </div>
  );
}
