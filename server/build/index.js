const MATCH_NAME = "tic_tac_toe";
var OpCode;
(function (OpCode) {
    OpCode[OpCode["MOVE"] = 1] = "MOVE";
    OpCode[OpCode["STATE"] = 2] = "STATE";
    OpCode[OpCode["GAME_OVER"] = 3] = "GAME_OVER";
    OpCode[OpCode["REMATCH_REQUEST"] = 4] = "REMATCH_REQUEST";
    OpCode[OpCode["REMATCH_DECLINED"] = 5] = "REMATCH_DECLINED";
})(OpCode || (OpCode = {}));
var GameMode;
(function (GameMode) {
    GameMode["CLASSIC"] = "classic";
    GameMode["TIMED"] = "timed";
})(GameMode || (GameMode = {}));
var Mark;
(function (Mark) {
    Mark[Mark["EMPTY"] = 0] = "EMPTY";
    Mark[Mark["X"] = 1] = "X";
    Mark[Mark["O"] = 2] = "O";
})(Mark || (Mark = {}));

const IDLE_WARNING_SEC = 30;
const FORFEIT_AFTER_WARNING_SEC = 60;
const TICK_RATE = 5;
const WIN_PATTERNS = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
    [0, 3, 6], [1, 4, 7], [2, 5, 8], // cols
    [0, 4, 8], [2, 4, 6], // diagonals
];
function checkWinner(board) {
    for (const [a, b, c] of WIN_PATTERNS) {
        if (board[a] !== Mark.EMPTY && board[a] === board[b] && board[b] === board[c]) {
            return board[a];
        }
    }
    return Mark.EMPTY;
}
function broadcastState(dispatcher, state) {
    dispatcher.broadcastMessage(OpCode.STATE, JSON.stringify(state));
}
function getIdleDeadline() {
    return Date.now() + IDLE_WARNING_SEC * 1000;
}
function getUserIdByMark(state, mark) {
    for (const userId in state.players) {
        if (state.players[userId].mark === mark)
            return userId;
    }
    return null;
}
function getOpponentId(state, userId) {
    for (const id in state.players) {
        if (id !== userId)
            return id;
    }
    return null;
}
const LEADERBOARD_ID$1 = "tic_tac_toe_wins";
function updateLeaderboard(nk, logger, state) {
    try {
        if (!state.winner)
            return;
        if (state.winner === "draw") {
            for (const userId in state.players) {
                updatePlayerStats(nk, userId, "draw");
            }
            return;
        }
        const winnerId = state.winner;
        const loserId = getOpponentId(state, winnerId);
        nk.leaderboardRecordWrite(LEADERBOARD_ID$1, winnerId, state.players[winnerId]?.username || "", 1);
        if (winnerId)
            updatePlayerStats(nk, winnerId, "win");
        if (loserId)
            updatePlayerStats(nk, loserId, "loss");
    }
    catch (e) {
        logger.error("Failed to update leaderboard: " + e);
    }
}
function resetGameState(state) {
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
function updatePlayerStats(nk, userId, result) {
    let wins = 0, losses = 0, draws = 0, streak = 0;
    try {
        const records = nk.storageRead([{ collection: "player_stats", key: "stats", userId }]);
        if (records.length > 0) {
            const data = records[0].value;
            wins = data.wins || 0;
            losses = data.losses || 0;
            draws = data.draws || 0;
            streak = data.streak || 0;
        }
    }
    catch {
        // First time
    }
    if (result === "win") {
        wins++;
        streak = streak > 0 ? streak + 1 : 1;
    }
    else if (result === "loss") {
        losses++;
        streak = streak < 0 ? streak - 1 : -1;
    }
    else {
        draws++;
        streak = 0;
    }
    nk.storageWrite([{
            collection: "player_stats",
            key: "stats",
            userId,
            value: { wins, losses, draws, streak },
            permissionRead: 2,
            permissionWrite: 0,
        }]);
}
const matchInit = function (_ctx, logger, _nk, params) {
    const mode = params?.mode || GameMode.CLASSIC;
    logger.info(`Match init with mode: ${mode}`);
    const state = {
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
const matchJoinAttempt = function (_ctx, _logger, _nk, _dispatcher, _tick, state, presence, _metadata) {
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
const matchJoin = function (_ctx, logger, _nk, dispatcher, _tick, state, presences) {
    for (const presence of presences) {
        if (presence.userId in state.players)
            continue;
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
    dispatcher.matchLabelUpdate(JSON.stringify({ mode: state.gameMode, open: playerCount < 2, players: playerCount }));
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
const matchLeave = function (_ctx, logger, nk, dispatcher, _tick, state, presences) {
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
        }
        else {
            delete state.players[presence.userId];
        }
    }
    dispatcher.matchLabelUpdate(JSON.stringify({ mode: state.gameMode, open: false, players: Object.keys(state.players).length }));
    return { state };
};
const matchLoop = function (_ctx, logger, nk, dispatcher, _tick, state, messages) {
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
                }
                else {
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
    if (Object.keys(state.players).length === 2 &&
        state.turnDeadline > 0 &&
        Date.now() > state.turnDeadline) {
        if (!state.idleWarned) {
            // 30s idle — issue warning, start 60s forfeit countdown
            logger.info("Player " + state.currentTurn + " idle — warning issued");
            state.idleWarned = true;
            state.forfeitDeadline = Date.now() + FORFEIT_AFTER_WARNING_SEC * 1000;
            broadcastState(dispatcher, state);
            return { state };
        }
    }
    if (state.idleWarned &&
        state.forfeitDeadline > 0 &&
        Date.now() > state.forfeitDeadline &&
        Object.keys(state.players).length === 2) {
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
        if (message.opCode !== OpCode.MOVE)
            continue;
        if (state.gameOver)
            break;
        if (Object.keys(state.players).length < 2)
            break;
        const senderId = message.sender.userId;
        if (senderId !== state.currentTurn) {
            logger.warn(`Not ${senderId}'s turn`);
            continue;
        }
        let move;
        try {
            move = JSON.parse(nk.binaryToString(message.data));
        }
        catch {
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
const matchTerminate = function (_ctx, _logger, _nk, _dispatcher, _tick, state, _graceSeconds) {
    return { state };
};
const matchSignal = function (_ctx, _logger, _nk, _dispatcher, _tick, state, _data) {
    return { state, data: "" };
};

function rpcFindMatch(ctx, logger, nk, payload) {
    let mode = GameMode.CLASSIC;
    try {
        const data = JSON.parse(payload);
        if (data.mode === GameMode.TIMED)
            mode = GameMode.TIMED;
    }
    catch {
        // default to classic
    }
    logger.info("Player " + ctx.userId + " looking for " + mode + " match");
    // List all authoritative matches with 0 or 1 players
    const limit = 10;
    const isAuthoritative = true;
    // Use null label to avoid filtering to only empty-string labels.
    const label = null;
    const minSize = 0;
    const maxSize = 2; // exclusive upper bound — matches size < 2 (i.e. 0 or 1 players)
    let matches = [];
    try {
        matches = nk.matchList(limit, isAuthoritative, label, minSize, maxSize, null);
        logger.info("matchList returned " + matches.length + " matches");
    }
    catch (e) {
        logger.error("matchList error: " + e);
    }
    // Filter for open matches with the right mode
    for (const match of matches) {
        try {
            const labelStr = match.label || "";
            if (!labelStr)
                continue;
            logger.info("Match " + match.matchId + " label: " + labelStr + " size: " + match.size);
            const l = JSON.parse(labelStr);
            if (l.open === true && l.mode === mode) {
                logger.info("Found existing match: " + match.matchId);
                return JSON.stringify({ matchId: match.matchId });
            }
        }
        catch {
            // skip malformed labels
        }
    }
    // No open match found — create a new one
    const matchId = nk.matchCreate(MATCH_NAME, { mode: mode });
    logger.info("Created new match: " + matchId);
    return JSON.stringify({ matchId: matchId });
}
function rpcListRooms(_ctx, _logger, nk, _payload) {
    const limit = 50;
    const isAuthoritative = true;
    const label = null;
    const minSize = 0;
    const maxSize = 2;
    let matches = [];
    try {
        matches = nk.matchList(limit, isAuthoritative, label, minSize, maxSize, null);
    }
    catch {
        // ignore
    }
    const rooms = [];
    for (const match of matches) {
        try {
            const labelStr = match.label || "";
            if (!labelStr)
                continue;
            const l = JSON.parse(labelStr);
            // Only show joinable/open rooms
            if (l.open === true) {
                rooms.push({
                    matchId: match.matchId,
                    players: match.size,
                    mode: l.mode || GameMode.CLASSIC,
                });
            }
        }
        catch {
            // ignore malformed labels
        }
    }
    return JSON.stringify({ rooms });
}
function rpcCreateRoom(_ctx, _logger, nk, payload) {
    let mode = GameMode.CLASSIC;
    try {
        const data = JSON.parse(payload || "{}");
        if (data.mode === GameMode.TIMED)
            mode = GameMode.TIMED;
    }
    catch {
        // keep default
    }
    const matchId = nk.matchCreate(MATCH_NAME, { mode });
    return JSON.stringify({ matchId });
}

const LEADERBOARD_ID = "tic_tac_toe_wins";
function initLeaderboard(nk, logger) {
    try {
        nk.leaderboardCreate(LEADERBOARD_ID, true, // authoritative
        "descending" /* nkruntime.SortOrder.DESCENDING */, "increment" /* nkruntime.Operator.INCREMENTAL */, undefined, // no reset schedule
        undefined // no metadata
        );
        logger.info("Leaderboard created/verified");
    }
    catch (e) {
        logger.error(`Failed to create leaderboard: ${e}`);
    }
}
function rpcGetLeaderboard(_ctx, logger, nk, _payload) {
    const limit = 20;
    const records = nk.leaderboardRecordsList(LEADERBOARD_ID, undefined, limit);
    const results = (records.records || []).map((r) => ({
        rank: r.rank,
        userId: r.ownerId,
        score: r.score,
    }));
    // Enrich with latest username and stats
    const enriched = results.map((r) => {
        let username = "Unknown";
        try {
            const accounts = nk.accountsGetId([r.userId]);
            if (accounts.length > 0) {
                const u = accounts[0].user;
                username = u?.username || "Unknown";
                // Nakama JS runtime may wrap username in { value: string }
                if (typeof username === "object" && username.value) {
                    username = username.value;
                }
            }
        }
        catch {
            // fallback
        }
        let wins = r.score, losses = 0, draws = 0, streak = 0;
        try {
            const storageRecords = nk.storageRead([
                { collection: "player_stats", key: "stats", userId: r.userId },
            ]);
            if (storageRecords.length > 0) {
                const stats = storageRecords[0].value;
                wins = stats.wins || 0;
                losses = stats.losses || 0;
                draws = stats.draws || 0;
                streak = stats.streak || 0;
            }
        }
        catch {
            // ignore
        }
        return { rank: r.rank, userId: r.userId, username: username, score: r.score, wins: wins, losses: losses, draws: draws, streak: streak };
    });
    return JSON.stringify({ records: enriched });
}
function rpcGetPlayerStats(ctx, _logger, nk, _payload) {
    try {
        const records = nk.storageRead([
            { collection: "player_stats", key: "stats", userId: ctx.userId },
        ]);
        if (records.length > 0) {
            return JSON.stringify(records[0].value);
        }
    }
    catch {
        // ignore
    }
    return JSON.stringify({ wins: 0, losses: 0, draws: 0, streak: 0 });
}

function InitModule(ctx, logger, nk, initializer) {
    // Register match handler
    initializer.registerMatch(MATCH_NAME, {
        matchInit: matchInit,
        matchJoinAttempt: matchJoinAttempt,
        matchJoin: matchJoin,
        matchLeave: matchLeave,
        matchLoop: matchLoop,
        matchTerminate: matchTerminate,
        matchSignal: matchSignal,
    });
    // Register RPCs
    initializer.registerRpc("find_match", rpcFindMatch);
    initializer.registerRpc("list_rooms", rpcListRooms);
    initializer.registerRpc("create_room", rpcCreateRoom);
    initializer.registerRpc("get_leaderboard", rpcGetLeaderboard);
    initializer.registerRpc("get_player_stats", rpcGetPlayerStats);
    // Initialize leaderboard
    initLeaderboard(nk, logger);
    logger.info("Tic-Tac-Toe module loaded!");
}
