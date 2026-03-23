import { useState, useEffect, useCallback, useRef } from "react";
import type { Socket, MatchData } from "@heroiclabs/nakama-js";

export interface PlayerInfo {
  userId: string;
  username: string;
  mark: number;
}

export interface GameState {
  board: number[];
  players: { [userId: string]: PlayerInfo };
  currentTurn: string;
  winner: string | null;
  gameOver: boolean;
  gameMode: string;
  turnDeadline: number;
  moveCount: number;
  turnStartedAt: number;
  timeSpent: { [userId: string]: number };
  idleWarned: boolean;
  forfeitDeadline: number;
  rematchRequestedBy: string[];
}

export type RematchStatus = "none" | "sent" | "received" | "declined";

const OpCode = {
  MOVE: 1,
  STATE: 2,
  REMATCH_REQUEST: 4,
  REMATCH_DECLINED: 5,
};

export function useMatch(socket: Socket | null, matchId: string | null, myUserId: string) {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [joined, setJoined] = useState(false);
  const [rematchStatus, setRematchStatus] = useState<RematchStatus>("none");
  const matchIdRef = useRef(matchId);

  useEffect(() => {
    matchIdRef.current = matchId;
  }, [matchId]);

  useEffect(() => {
    if (!socket || !matchId) return;

    setRematchStatus("none");

    const onMatchData = (data: MatchData) => {
      if (data.match_id !== matchIdRef.current) return;

      if (data.op_code === OpCode.STATE) {
        try {
          const decoded = new TextDecoder().decode(data.data);
          const state: GameState = JSON.parse(decoded);
          setGameState(state);
          if (!state.gameOver) setRematchStatus("none");
        } catch { /* ignore */ }
      }

      if (data.op_code === OpCode.REMATCH_DECLINED) {
        setRematchStatus("declined");
      }
    };

    socket.onmatchdata = onMatchData;

    socket.joinMatch(matchId).then(() => {
      setJoined(true);
    }).catch((e) => {
      console.error("Failed to join match:", e);
    });

    return () => {
      if (matchIdRef.current) {
        socket.leaveMatch(matchIdRef.current).catch(() => {});
      }
      setJoined(false);
      setGameState(null);
      setRematchStatus("none");
    };
  }, [socket, matchId]);

  useEffect(() => {
    if (!gameState || !gameState.gameOver) return;
    const requests = gameState.rematchRequestedBy || [];
    if (requests.length > 0 && !requests.includes(myUserId) && rematchStatus === "none") {
      setRematchStatus("received");
    }
  }, [gameState, myUserId, rematchStatus]);

  const sendMove = useCallback(
    (position: number) => {
      if (!socket || !matchIdRef.current) return;
      socket.sendMatchState(matchIdRef.current, OpCode.MOVE, JSON.stringify({ position }));
    },
    [socket]
  );

  const sendRematchRequest = useCallback(() => {
    if (!socket || !matchIdRef.current) return;
    socket.sendMatchState(matchIdRef.current, OpCode.REMATCH_REQUEST, "{}");
    setRematchStatus("sent");
  }, [socket]);

  const sendRematchDecline = useCallback(() => {
    if (!socket || !matchIdRef.current) return;
    socket.sendMatchState(matchIdRef.current, OpCode.REMATCH_DECLINED, "{}");
    setRematchStatus("declined");
  }, [socket]);

  return { gameState, joined, sendMove, sendRematchRequest, sendRematchDecline, rematchStatus };
}
