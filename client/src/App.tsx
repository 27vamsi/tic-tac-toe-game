import { useState, useCallback, useEffect } from "react";
import { useNakama } from "./hooks/useNakama";
import { useMatch } from "./hooks/useMatch";
import { findMatch, getPlayerStats, createRoom } from "./nakama";
import { Lobby } from "./components/Lobby";
import { Board } from "./components/Board";
import { GameInfo } from "./components/GameInfo";

const WIN_PATTERNS = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

function getWinningLine(board: number[]): number[] | undefined {
  for (const [a, b, c] of WIN_PATTERNS) {
    if (board[a] !== 0 && board[a] === board[b] && board[b] === board[c]) {
      return [a, b, c];
    }
  }
  return undefined;
}

function App() {
  const { session, socket, connected } = useNakama();
  const [matchId, setMatchId] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [stats, setStats] = useState<{ wins: number; losses: number; draws: number; streak: number } | null>(null);
  const { gameState, sendMove, sendRematchRequest, sendRematchDecline, rematchStatus } = useMatch(socket, matchId, session?.user_id || "");

  const myUserId = session?.user_id || "";

  useEffect(() => {
    if (connected) {
      getPlayerStats().then(setStats).catch(() => {});
    }
  }, [connected]);

  const handleFindMatch = useCallback(async (mode: "classic" | "timed") => {
    try {
      setSearching(true);
      const id = await findMatch(mode);
      setMatchId(id);
    } catch (e) {
      console.error("Failed to find match:", e);
    } finally {
      setSearching(false);
    }
  }, []);

  const handleCellClick = useCallback((position: number) => {
    if (!gameState || gameState.gameOver) return;
    if (gameState.currentTurn !== myUserId) return;
    if (gameState.board[position] !== 0) return;
    sendMove(position);
  }, [gameState, myUserId, sendMove]);

  const handleBackToLobby = useCallback(() => {
    setMatchId(null);
    getPlayerStats().then(setStats).catch(() => {});
  }, []);

  const handleJoinRoom = useCallback((id: string) => {
    setMatchId(id);
  }, []);

  const handleCreateRoom = useCallback(async (mode: "classic" | "timed") => {
    try {
      setSearching(true);
      const id = await createRoom(mode);
      setMatchId(id);
    } catch (e) {
      console.error("Failed to create room:", e);
    } finally {
      setSearching(false);
    }
  }, []);

  if (!matchId) {
    return (
      <div className="app">
        <Lobby
          onFindMatch={handleFindMatch}
          onJoinRoom={handleJoinRoom}
          onCreateRoom={handleCreateRoom}
          searching={searching}
          connected={connected}
          stats={stats}
        />
      </div>
    );
  }

  const isMyTurn = gameState?.currentTurn === myUserId && !gameState?.gameOver;
  const waitingForPlayers = !gameState || Object.keys(gameState.players).length < 2;
  const boardDisabled = !isMyTurn || waitingForPlayers;

  const winningLine = gameState?.gameOver && gameState.winner !== "draw"
    ? getWinningLine(gameState.board)
    : undefined;

  return (
    <div className="app">
      <div className="game">
        {gameState && (
          <GameInfo gameState={gameState} myUserId={myUserId} />
        )}

        {waitingForPlayers && !gameState?.gameOver && (
          <div className="waiting">
            <div className="spinner" />
            <p>Waiting for opponent...</p>
          </div>
        )}

        <Board
          board={gameState?.board || Array(9).fill(0)}
          onCellClick={handleCellClick}
          disabled={boardDisabled}
          winningLine={winningLine}
        />

        {gameState?.gameOver && (
          <div className="result-card">
            <div className="result-title">
              {gameState.winner === "draw" ? "DRAW" : gameState.winner === myUserId ? "WINNER! +1" : "DEFEAT"}
            </div>

            <div className="rematch-actions">
              {Object.keys(gameState.players).length < 2 ? (
                <>
                  <div className="rematch-declined">Opponent left the match</div>
                  <button className="back-btn" onClick={handleBackToLobby}>
                    Back to Lobby
                  </button>
                </>
              ) : (
                <>
                  {rematchStatus === "none" && (
                    <>
                      <button className="rematch-btn" onClick={sendRematchRequest}>
                        Rematch
                      </button>
                      <button className="back-btn" onClick={handleBackToLobby}>
                        Back to Lobby
                      </button>
                    </>
                  )}

                  {rematchStatus === "sent" && (
                    <>
                      <div className="rematch-waiting">
                        <div className="spinner spinner-small" />
                        <span>Waiting for opponent...</span>
                      </div>
                      <button className="back-btn" onClick={handleBackToLobby}>
                        Back to Lobby
                      </button>
                    </>
                  )}

                  {rematchStatus === "received" && (
                    <>
                      <div className="rematch-prompt">Opponent wants a rematch!</div>
                      <div className="rematch-buttons">
                        <button className="rematch-btn" onClick={sendRematchRequest}>
                          Accept
                        </button>
                        <button className="decline-btn" onClick={sendRematchDecline}>
                          Decline
                        </button>
                      </div>
                      <button className="back-btn" onClick={handleBackToLobby}>
                        Back to Lobby
                      </button>
                    </>
                  )}

                  {rematchStatus === "declined" && (
                    <>
                      <div className="rematch-declined">Rematch declined</div>
                      <button className="back-btn" onClick={handleBackToLobby}>
                        Back to Lobby
                      </button>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {!gameState?.gameOver && (
          <button className="back-btn leave-btn" onClick={handleBackToLobby}>
            Leave Room
          </button>
        )}
      </div>
    </div>
  );
}

export default App;
