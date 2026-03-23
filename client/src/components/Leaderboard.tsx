import { useState, useEffect } from "react";
import { getLeaderboard } from "../nakama";

interface LeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  score: number;
  wins: number;
  losses: number;
  draws: number;
  streak: number;
}

export function Leaderboard() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLeaderboard();
  }, []);

  async function loadLeaderboard() {
    try {
      setLoading(true);
      const records = await getLeaderboard();
      setEntries(records);
    } catch {
      // leaderboard may be empty
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <div className="leaderboard-loading">Loading leaderboard...</div>;

  if (entries.length === 0) {
    return (
      <div className="leaderboard">
        <h2>Leaderboard</h2>
        <p className="leaderboard-empty">No games played yet. Be the first!</p>
      </div>
    );
  }

  return (
    <div className="leaderboard">
      <h2>Leaderboard</h2>
      <div className="leaderboard-scroll">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Player</th>
              <th>Wins</th>
              <th>Losses</th>
              <th>Draws</th>
              <th>Streak</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, i) => (
              <tr key={entry.userId}>
                <td className="rank">{i + 1}</td>
                <td className="username">{entry.username}</td>
                <td>{entry.wins}</td>
                <td>{entry.losses}</td>
                <td>{entry.draws}</td>
                <td className={entry.streak > 0 ? "streak-positive" : entry.streak < 0 ? "streak-negative" : ""}>
                  {entry.streak > 0 ? `+${entry.streak}` : entry.streak}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
