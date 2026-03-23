import { GameMode, GameState, Mark, MoveMessage, OpCode } from "./types";

const IDLE_WARNING_SEC = 30;
const FORFEIT_AFTER_WARNING_SEC = 60;
const TICK_RATE = 5;

const WIN_PATTERNS = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // cols
  [0, 4, 8], [2, 4, 6],            // diagonals
];

function checkWinner(board: Mark[]): Mark {
  for (const [a, b, c] of WIN_PATTERNS) {
    if (board[a] !== Mark.EMPTY && board[a] === board[b] && board[b] === board[c]) {
      return board[a];
    }
  }
  return Mark.EMPTY;
}

function broadcastState(dispatcher: nkruntime.MatchDispatcher, state: GameState) {
  dispatcher.broadcastMessage(OpCode.STATE, JSON.stringify(state));
}

function getIdleDeadline(): number {
  return Date.now() + IDLE_WARNING_SEC * 1000;
}

function getUserIdByMark(state: GameState, mark: Mark): string | null {
  for (const userId in state.players) {
    if (state.players[userId].mark === mark) return userId;
  }
  return null;
}

function getOpponentId(state: GameState, userId: string): string | null {
  for (const id in state.players) {
    if (id !== userId) return id;
  }
  return null;
}

const LEADERBOARD_ID = "tic_tac_toe_wins";

function updateLeaderboard(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  state: GameState
) {
  try {
    if (!state.winner) return;

    if (state.winner === "draw") {
      for (const userId in state.players) {
        updatePlayerStats(nk, userId, "draw");
      }
      return;
    }

    const winnerId = state.winner;
    const loserId = getOpponentId(state, winnerId);

    nk.leaderboardRecordWrite(LEADERBOARD_ID, winnerId, state.players[winnerId]?.username || "", 1);

    if (winnerId) updatePlayerStats(nk, winnerId, "win");
    if (loserId) updatePlayerStats(nk, loserId, "loss");
  } catch (e) {
    logger.error("Failed to update leaderboard: " + e);
  }
}

function resetGameState(state: GameState) {
  // Swap marks so the previous O player goes first as X
  for (const userId in state.players) {
    state.players[userId].mark = state.players[userId].mark === Mark.X ? Mark.O : Mark.X;
  }

  const newXPlayer = getUserIdByMark(state, Mark.X);

  state.board = Array(9).fill(Mark.EMPTY);
  state.currentTurn = newXPlayer || "";
  state.winner = null;
  state.gameOver = false;
  state.turnDeadline = getIdleDeadline();
  state.moveCount = 0;
  state.turnStartedAt = Date.now();
  state.timeSpent = {};
  for (const uid in state.players) {
    state.timeSpent[uid] = 0;
  }
  state.idleWarned = false;
  state.forfeitDeadline = 0;
  state.rematchRequestedBy = [];
}

function updatePlayerStats(nk: nkruntime.Nakama, userId: string, result: "win" | "loss" | "draw") {
  let wins = 0, losses = 0, draws = 0, streak = 0;

  try {
    const records = nk.storageRead([{ collection: "player_stats", key: "stats", userId }]);
    if (records.length > 0) {
      const data = records[0].value as { wins: number; losses: number; draws: number; streak: number };
      wins = data.wins || 0;
      losses = data.losses || 0;
      draws = data.draws || 0;
      streak = data.streak || 0;
    }
  } catch {
    // First time
  }

  if (result === "win") {
    wins++;
    streak = streak > 0 ? streak + 1 : 1;
  } else if (result === "loss") {
    losses++;
    streak = streak < 0 ? streak - 1 : -1;
  } else {
    draws++;
    streak = 0;
  }

  nk.storageWrite([{
    collection: "player_stats",
    key: "stats",
    userId,
    value: { wins, losses, draws, streak },
    permissionRead: 2 as nkruntime.ReadPermissionValues,
    permissionWrite: 0 as nkruntime.WritePermissionValues,
  }]);
}

export const matchInit: nkruntime.MatchInitFunction<GameState> = function (
  _ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  _nk: nkruntime.Nakama,
  params: { [key: string]: any }
): { state: GameState; tickRate: number; label: string } {
  const mode = (params?.mode as GameMode) || GameMode.CLASSIC;
  logger.info(`Match init with mode: ${mode}`);

  const state: GameState = {
    board: Array(9).fill(Mark.EMPTY),
    players: {},
    currentTurn: "",
    winner: null,
    gameOver: false,
    gameMode: mode,
    turnDeadline: 0,
    moveCount: 0,
    turnStartedAt: 0,
    timeSpent: {},
    idleWarned: false,
    forfeitDeadline: 0,
    rematchRequestedBy: [],
  };

  return {
    state,
    tickRate: TICK_RATE,
    label: JSON.stringify({ mode, open: true, players: 0 }),
  };
};

export const matchJoinAttempt: nkruntime.MatchJoinAttemptFunction<GameState> = function (
  _ctx: nkruntime.Context,
  _logger: nkruntime.Logger,
  _nk: nkruntime.Nakama,
  _dispatcher: nkruntime.MatchDispatcher,
  _tick: number,
  state: GameState,
  presence: nkruntime.Presence,
  _metadata: { [key: string]: any }
) {
  const playerCount = Object.keys(state.players).length;
  const alreadyJoined = presence.userId in state.players;

  if (alreadyJoined) {
    return { state, accept: true };
  }

  if (playerCount >= 2) {
    return { state, accept: false, rejectMessage: "Match is full" };
  }

  if (state.gameOver) {
    return { state, accept: false, rejectMessage: "Game is over" };
  }

  return { state, accept: true };
};

export const matchJoin: nkruntime.MatchJoinFunction<GameState> = function (
  _ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  _nk: nkruntime.Nakama,
  dispatcher: nkruntime.MatchDispatcher,
  _tick: number,
  state: GameState,
  presences: nkruntime.Presence[]
) {
  for (const presence of presences) {
    if (presence.userId in state.players) continue;

    const playerCount = Object.keys(state.players).length;
    const mark = playerCount === 0 ? Mark.X : Mark.O;

    state.players[presence.userId] = {
      userId: presence.userId,
      username: presence.username || `Player${playerCount + 1}`,
      mark,
    };

    logger.info(`Player ${presence.username} joined as ${mark === Mark.X ? "X" : "O"}`);
  }

  const playerCount = Object.keys(state.players).length;

  dispatcher.matchLabelUpdate(
    JSON.stringify({ mode: state.gameMode, open: playerCount < 2, players: playerCount })
  );

  if (playerCount === 2) {
    const xPlayer = getUserIdByMark(state, Mark.X);
    if (xPlayer) {
      state.currentTurn = xPlayer;
      state.turnDeadline = getIdleDeadline();
      state.turnStartedAt = Date.now();
      state.idleWarned = false;
      state.forfeitDeadline = 0;
    }
    // Initialize timeSpent for both players
    for (const uid in state.players) {
      if (!(uid in state.timeSpent)) {
        state.timeSpent[uid] = 0;
      }
    }
    broadcastState(dispatcher, state);
  }

  return { state };
};

export const matchLeave: nkruntime.MatchLeaveFunction<GameState> = function (
  _ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  dispatcher: nkruntime.MatchDispatcher,
  _tick: number,
  state: GameState,
  presences: nkruntime.Presence[]
) {
  for (const presence of presences) {
    logger.info(`Player ${presence.username} left`);

    if (!state.gameOver && Object.keys(state.players).length === 2) {
      const opponent = getOpponentId(state, presence.userId);
      if (opponent) {
        state.winner = opponent;
        state.gameOver = true;
        updateLeaderboard(nk, logger, state);
        broadcastState(dispatcher, state);
      }
    }

    if (state.gameOver) {
      // Clear any pending rematch
      state.rematchRequestedBy = [];
      delete state.players[presence.userId];
      // Broadcast so remaining player sees opponent left
      broadcastState(dispatcher, state);
    } else {
      delete state.players[presence.userId];
    }
  }

  dispatcher.matchLabelUpdate(
    JSON.stringify({ mode: state.gameMode, open: false, players: Object.keys(state.players).length })
  );

  return { state };
};

export const matchLoop: nkruntime.MatchLoopFunction<GameState> = function (
  _ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  dispatcher: nkruntime.MatchDispatcher,
  _tick: number,
  state: GameState,
  messages: nkruntime.MatchMessage[]
) {
  if (state.gameOver) {
    // Process rematch messages while game is over
    for (const message of messages) {
      const senderId = message.sender.userId;

      if (message.opCode === OpCode.REMATCH_REQUEST) {
        if (!state.rematchRequestedBy.includes(senderId)) {
          state.rematchRequestedBy.push(senderId);
        }

        if (state.rematchRequestedBy.length >= 2) {
          // Both players want rematch — reset the game
          resetGameState(state);
          broadcastState(dispatcher, state);
        } else {
          // Notify opponent of the request
          broadcastState(dispatcher, state);
        }
      }

      if (message.opCode === OpCode.REMATCH_DECLINED) {
        state.rematchRequestedBy = [];
        dispatcher.broadcastMessage(OpCode.REMATCH_DECLINED, JSON.stringify({ declinedBy: senderId }));
        broadcastState(dispatcher, state);
      }
    }
    return { state };
  }

  // Idle / forfeit check (applies to all modes)
  if (
    Object.keys(state.players).length === 2 &&
    state.turnDeadline > 0 &&
    Date.now() > state.turnDeadline
  ) {
    if (!state.idleWarned) {
      // 30s idle — issue warning, start 60s forfeit countdown
      logger.info("Player " + state.currentTurn + " idle — warning issued");
      state.idleWarned = true;
      state.forfeitDeadline = Date.now() + FORFEIT_AFTER_WARNING_SEC * 1000;
      broadcastState(dispatcher, state);
      return { state };
    }
  }

  if (
    state.idleWarned &&
    state.forfeitDeadline > 0 &&
    Date.now() > state.forfeitDeadline &&
    Object.keys(state.players).length === 2
  ) {
    logger.info("Player " + state.currentTurn + " forfeited due to inactivity");
    const opponent = getOpponentId(state, state.currentTurn);
    if (opponent) {
      state.winner = opponent;
      state.gameOver = true;
      state.turnDeadline = 0;
      state.forfeitDeadline = 0;
      updateLeaderboard(nk, logger, state);
      broadcastState(dispatcher, state);
    }
    return { state };
  }

  for (const message of messages) {
    if (message.opCode !== OpCode.MOVE) continue;
    if (state.gameOver) break;
    if (Object.keys(state.players).length < 2) break;

    const senderId = message.sender.userId;

    if (senderId !== state.currentTurn) {
      logger.warn(`Not ${senderId}'s turn`);
      continue;
    }

    let move: MoveMessage;
    try {
      move = JSON.parse(nk.binaryToString(message.data));
    } catch {
      logger.warn("Invalid move data");
      continue;
    }

    if (move.position < 0 || move.position > 8) {
      logger.warn(`Invalid position: ${move.position}`);
      continue;
    }

    if (state.board[move.position] !== Mark.EMPTY) {
      logger.warn(`Cell ${move.position} already occupied`);
      continue;
    }

    // Track time spent on this turn
    if (state.turnStartedAt > 0) {
      const elapsed = Date.now() - state.turnStartedAt;
      state.timeSpent[senderId] = (state.timeSpent[senderId] || 0) + elapsed;
    }

    const playerMark = state.players[senderId].mark;
    state.board[move.position] = playerMark;
    state.moveCount++;

    const winner = checkWinner(state.board);
    if (winner !== Mark.EMPTY) {
      state.winner = getUserIdByMark(state, winner);
      state.gameOver = true;
      state.turnDeadline = 0;
      updateLeaderboard(nk, logger, state);
      broadcastState(dispatcher, state);
      return { state };
    }

    if (state.moveCount >= 9) {
      state.winner = "draw";
      state.gameOver = true;
      state.turnDeadline = 0;
      updateLeaderboard(nk, logger, state);
      broadcastState(dispatcher, state);
      return { state };
    }

    const opponent = getOpponentId(state, senderId);
    if (opponent) {
      state.currentTurn = opponent;
      state.turnDeadline = getIdleDeadline();
      state.turnStartedAt = Date.now();
      state.idleWarned = false;
      state.forfeitDeadline = 0;
    }

    broadcastState(dispatcher, state);
  }

  return { state };
};

export const matchTerminate: nkruntime.MatchTerminateFunction<GameState> = function (
  _ctx: nkruntime.Context,
  _logger: nkruntime.Logger,
  _nk: nkruntime.Nakama,
  _dispatcher: nkruntime.MatchDispatcher,
  _tick: number,
  state: GameState,
  _graceSeconds: number
) {
  return { state };
};

export const matchSignal: nkruntime.MatchSignalFunction<GameState> = function (
  _ctx: nkruntime.Context,
  _logger: nkruntime.Logger,
  _nk: nkruntime.Nakama,
  _dispatcher: nkruntime.MatchDispatcher,
  _tick: number,
  state: GameState,
  _data: string
) {
  return { state, data: "" };
};
