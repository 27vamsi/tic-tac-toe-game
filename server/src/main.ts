import { MATCH_NAME } from "./types";
import {
  matchInit,
  matchJoinAttempt,
  matchJoin,
  matchLeave,
  matchLoop,
  matchTerminate,
  matchSignal,
} from "./match_handler";
import { rpcFindMatch, rpcListRooms, rpcCreateRoom } from "./matchmaking";
import { initLeaderboard, rpcGetLeaderboard, rpcGetPlayerStats } from "./leaderboard";

function InitModule(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  initializer: nkruntime.Initializer
) {
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
