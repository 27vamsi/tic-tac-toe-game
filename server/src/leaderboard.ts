const LEADERBOARD_ID = "tic_tac_toe_wins";

export function initLeaderboard(nk: nkruntime.Nakama, logger: nkruntime.Logger) {
  try {
    nk.leaderboardCreate(
      LEADERBOARD_ID,
      true,         // authoritative
      nkruntime.SortOrder.DESCENDING,
      nkruntime.Operator.INCREMENTAL,
      undefined,    // no reset schedule
      undefined     // no metadata
    );
    logger.info("Leaderboard created/verified");
  } catch (e) {
    logger.error(`Failed to create leaderboard: ${e}`);
  }
}

export function rpcGetLeaderboard(
  _ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  _payload: string
): string {
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
        username = (u as any)?.username || "Unknown";
        // Nakama JS runtime may wrap username in { value: string }
        if (typeof username === "object" && (username as any).value) {
          username = (username as any).value;
        }
      }
    } catch {
      // fallback
    }

    let wins = r.score, losses = 0, draws = 0, streak = 0;
    try {
      const storageRecords = nk.storageRead([
        { collection: "player_stats", key: "stats", userId: r.userId },
      ]);
      if (storageRecords.length > 0) {
        const stats = storageRecords[0].value as { wins: number; losses: number; draws: number; streak: number };
        wins = stats.wins || 0;
        losses = stats.losses || 0;
        draws = stats.draws || 0;
        streak = stats.streak || 0;
      }
    } catch {
      // ignore
    }

    return { rank: r.rank, userId: r.userId, username: username, score: r.score, wins: wins, losses: losses, draws: draws, streak: streak };
  });

  return JSON.stringify({ records: enriched });
}

export function rpcGetPlayerStats(
  ctx: nkruntime.Context,
  _logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  _payload: string
): string {
  try {
    const records = nk.storageRead([
      { collection: "player_stats", key: "stats", userId: ctx.userId! },
    ]);
    if (records.length > 0) {
      return JSON.stringify(records[0].value);
    }
  } catch {
    // ignore
  }
  return JSON.stringify({ wins: 0, losses: 0, draws: 0, streak: 0 });
}
