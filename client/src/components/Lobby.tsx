import { useEffect, useState } from "react";
import { Leaderboard } from "./Leaderboard";
import { getSavedUsername, setPlayerName, listRooms, type RoomInfo } from "../nakama";

interface LobbyProps {
  onFindMatch: (mode: "classic" | "timed") => void;
  onJoinRoom: (matchId: string) => void;
  onCreateRoom: (mode: "classic" | "timed") => void;
  searching: boolean;
  connected: boolean;
  stats: { wins: number; losses: number; draws: number; streak: number } | null;
}

export function Lobby({ onFindMatch, onJoinRoom, onCreateRoom, searching, connected, stats }: LobbyProps) {
  const [mode, setMode] = useState<"classic" | "timed">("classic");
  const [name, setName] = useState<string>("");
  const [savedName, setSavedName] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState<string>("");
  const [rooms, setRooms] = useState<RoomInfo[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(false);

  useEffect(() => {
    const initial = getSavedUsername() || "";
    setName(initial);
    setSavedName(initial);
  }, []);

  const handleSaveName = async () => {
    const trimmed = name.trim();
    if (trimmed.length === 0) return;
    try {
      setSaving(true);
      setNameError("");
      await setPlayerName(trimmed);
      setSavedName(trimmed);
    } catch {
      setNameError("Could not save name. Try letters/numbers only.");
    } finally {
      setSaving(false);
    }
  };

  const refreshRooms = async () => {
    try {
      setLoadingRooms(true);
      const list = await listRooms();
      setRooms(list);
    } finally {
      setLoadingRooms(false);
    }
  };

  useEffect(() => {
    refreshRooms().catch(() => {});
  }, []);

  // Auto-refresh rooms while connected
  useEffect(() => {
    if (!connected) return;
    let cancelled = false;
    let interval: number | undefined;
    // Immediate refresh on connect
    refreshRooms().catch(() => {});
    interval = window.setInterval(() => {
      if (!cancelled) refreshRooms().catch(() => {});
    }, 3000);
    return () => {
      cancelled = true;
      if (interval) window.clearInterval(interval);
    };
  }, [connected]);

  return (
    <div className="lobby">
      <h1 className="title">Tic Tac Toe</h1>
      <p className="subtitle">Multiplayer</p>

      <div className="name-card">
        <div className="avatar">{(name || "P").trim().slice(0, 1).toUpperCase()}</div>
        <div className="name-controls">
          <input
            className="name-input"
            type="text"
            placeholder="Enter your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={20}
          />
          <button
            className="save-name-btn"
            onClick={handleSaveName}
            disabled={saving || name.trim().length === 0 || name.trim() === savedName}
            title={!connected ? "Will apply when connected" : undefined}
          >
            {saving ? "Saving..." : savedName ? "Change" : "Save"}
          </button>
        </div>
      </div>
      {nameError && <p className="error-text">{nameError}</p>}

      {stats && (
        <div className="my-stats">
          <span>W: {stats.wins}</span>
          <span>L: {stats.losses}</span>
          <span>D: {stats.draws}</span>
          <span>Streak: {stats.streak > 0 ? `+${stats.streak}` : stats.streak}</span>
        </div>
      )}

      <div className="mode-select">
        <button
          className={`mode-btn ${mode === "classic" ? "mode-active" : ""}`}
          onClick={() => setMode("classic")}
        >
          Classic
        </button>
        <button
          className={`mode-btn ${mode === "timed" ? "mode-active" : ""}`}
          onClick={() => setMode("timed")}
        >
          Timed (30s)
        </button>
      </div>

      <button
        className="find-match-btn"
        onClick={() => onFindMatch(mode)}
        disabled={searching || !connected}
      >
        {!connected ? "Connecting..." : searching ? "Searching..." : "Find Match"}
      </button>

      <div className="rooms">
        <div className="rooms-header">
          <h2>Game Rooms</h2>
          <div className="rooms-actions">
            <button className="refresh-rooms-btn" onClick={refreshRooms} disabled={loadingRooms}>
              {loadingRooms ? "Refreshing..." : "Refresh"}
            </button>
            <button className="create-room-btn" onClick={() => onCreateRoom(mode)} disabled={searching || !connected}>
              Create Room
            </button>
          </div>
        </div>
        {rooms.length === 0 ? (
          <p className="rooms-empty">No open rooms. Create one!</p>
        ) : (
          <ul className="rooms-list">
            {rooms.map((r) => (
              <li key={r.matchId} className="room-item">
                <span className="room-mode">{r.mode === "timed" ? "Timed" : "Classic"}</span>
                <span className="room-players">{r.players}/2</span>
                <button className="join-room-btn" onClick={() => onJoinRoom(r.matchId)} disabled={!connected}>
                  Join
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Leaderboard />
    </div>
  );
}
