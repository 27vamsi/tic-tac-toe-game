export const MATCH_NAME = "tic_tac_toe";

export enum OpCode {
  MOVE = 1,
  STATE = 2,
  GAME_OVER = 3,
  REMATCH_REQUEST = 4,
  REMATCH_DECLINED = 5,
}

export enum GameMode {
  CLASSIC = "classic",
  TIMED = "timed",
}

export enum Mark {
  EMPTY = 0,
  X = 1,
  O = 2,
}

export interface PlayerInfo {
  userId: string;
  username: string;
  mark: Mark;
}

export interface GameState {
  board: Mark[];
  players: { [userId: string]: PlayerInfo };
  currentTurn: string;
  winner: string | null;
  gameOver: boolean;
  gameMode: GameMode;
  turnDeadline: number;
  moveCount: number;
  turnStartedAt: number;
  timeSpent: { [userId: string]: number };
  idleWarned: boolean;
  forfeitDeadline: number;
  rematchRequestedBy: string[];
}

export interface MoveMessage {
  position: number;
}
