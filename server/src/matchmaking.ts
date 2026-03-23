import { GameMode, MATCH_NAME } from "./types";

export function rpcFindMatch(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  let mode = GameMode.CLASSIC;
  try {
    const data = JSON.parse(payload);
    if (data.mode === GameMode.TIMED) mode = GameMode.TIMED;
  } catch {
    // default to classic
  }

  logger.info("Player " + ctx.userId + " looking for " + mode + " match");

  // List all authoritative matches with 0 or 1 players
  const limit = 10;
  const isAuthoritative = true;
  // Use null label to avoid filtering to only empty-string labels.
  const label: string | null = null;
  const minSize = 0;
  const maxSize = 2; // exclusive upper bound — matches size < 2 (i.e. 0 or 1 players)

  let matches: nkruntime.Match[] = [];
  try {
    matches = nk.matchList(limit, isAuthoritative, label, minSize, maxSize, null);
    logger.info("matchList returned " + matches.length + " matches");
  } catch (e) {
    logger.error("matchList error: " + e);
  }

  // Filter for open matches with the right mode
  for (const match of matches) {
    try {
      const labelStr = match.label || "";
      if (!labelStr) continue;
      logger.info("Match " + match.matchId + " label: " + labelStr + " size: " + match.size);
      const l = JSON.parse(labelStr);
      if (l.open === true && l.mode === mode) {
        logger.info("Found existing match: " + match.matchId);
        return JSON.stringify({ matchId: match.matchId });
      }
    } catch {
      // skip malformed labels
    }
  }

  // No open match found — create a new one
  const matchId = nk.matchCreate(MATCH_NAME, { mode: mode });
  logger.info("Created new match: " + matchId);
  return JSON.stringify({ matchId: matchId });
}

export function rpcListRooms(
  _ctx: nkruntime.Context,
  _logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  _payload: string
): string {
  const limit = 50;
  const isAuthoritative = true;
  const label: string | null = null;
  const minSize = 0;
  const maxSize = 2;

  let matches: nkruntime.Match[] = [];
  try {
    matches = nk.matchList(limit, isAuthoritative, label, minSize, maxSize, null);
  } catch {
    // ignore
  }

  const rooms = [];
  for (const match of matches) {
    try {
      const labelStr = match.label || "";
      if (!labelStr) continue;
      const l = JSON.parse(labelStr);
      // Only show joinable/open rooms
      if (l.open === true) {
        rooms.push({
          matchId: match.matchId,
          players: match.size,
          mode: l.mode || GameMode.CLASSIC,
        });
      }
    } catch {
      // ignore malformed labels
    }
  }
  return JSON.stringify({ rooms });
}

export function rpcCreateRoom(
  _ctx: nkruntime.Context,
  _logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  let mode = GameMode.CLASSIC;
  try {
    const data = JSON.parse(payload || "{}");
    if (data.mode === GameMode.TIMED) mode = GameMode.TIMED;
  } catch {
    // keep default
  }
  const matchId = nk.matchCreate(MATCH_NAME, { mode });
  return JSON.stringify({ matchId });
}
