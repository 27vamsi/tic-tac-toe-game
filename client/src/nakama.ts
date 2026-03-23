import { Client, type Session, type Socket } from "@heroiclabs/nakama-js";

const NAKAMA_HOST = import.meta.env.VITE_NAKAMA_HOST || "127.0.0.1";
const NAKAMA_PORT = import.meta.env.VITE_NAKAMA_PORT || "7350";
const NAKAMA_SSL = import.meta.env.VITE_NAKAMA_SSL === "true";
const NAKAMA_KEY = import.meta.env.VITE_NAKAMA_KEY || "defaultkey";

export const client = new Client(NAKAMA_KEY, NAKAMA_HOST, NAKAMA_PORT, NAKAMA_SSL);

let session: Session | null = null;
let socket: Socket | null = null;
let socketConnected = false;
const USERNAME_STORAGE_KEY = "nakama_username";

function getDeviceId(): string {
  // Allow override via URL param for testing: ?player=2
  const params = new URLSearchParams(window.location.search);
  const playerParam = params.get("player");
  const storageKey = playerParam ? `nakama_device_id_${playerParam}` : "nakama_device_id";

  let id = localStorage.getItem(storageKey);
  if (!id) {
    id = typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0;
          return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
        });
    localStorage.setItem(storageKey, id);
  }
  return id;
}

export function getSavedUsername(): string | null {
  const name = localStorage.getItem(USERNAME_STORAGE_KEY);
  if (!name) return null;
  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function setSavedUsername(name: string) {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    localStorage.removeItem(USERNAME_STORAGE_KEY);
  } else {
    localStorage.setItem(USERNAME_STORAGE_KEY, trimmed);
  }
}

async function ensureAccountUsername(sess: Session) {
  const preferred = getSavedUsername();
  if (!preferred) return;
  try {
    const account = await client.getAccount(sess);
    const current = account?.user?.username || "";
    if (current !== preferred) {
      await client.updateAccount(sess, { username: preferred });
    }
  } catch {
    // ignore username sync errors
  }
}

export async function authenticate(): Promise<Session> {
  if (session && !session.isexpired(Date.now() / 1000)) {
    return session;
  }

  const deviceId = getDeviceId();
  // Pass username on first-time create; if account already exists, we'll sync below.
  const initialUsername = getSavedUsername() || undefined;
  session = await client.authenticateDevice(deviceId, true, initialUsername);
  // Ensure username is updated if it changed after first auth.
  await ensureAccountUsername(session);
  return session;
}

export async function getSocket(): Promise<Socket> {
  if (socket && socketConnected) return socket;

  // Close stale socket if any
  if (socket) {
    try { socket.disconnect(false); } catch { /* ignore */ }
    socket = null;
    socketConnected = false;
  }

  const sess = await authenticate();
  socket = client.createSocket(NAKAMA_SSL, false);

  await socket.connect(sess, true);
  socketConnected = true;
  return socket;
}

export function isSocketConnected(): boolean {
  return socketConnected;
}

export function disconnectSocket() {
  if (socket) {
    try { socket.disconnect(false); } catch { /* ignore */ }
    socket = null;
    socketConnected = false;
  }
}

export function getSession(): Session | null {
  return session;
}

export function clearSession() {
  session = null;
}

export async function setPlayerName(name: string): Promise<void> {
  const trimmed = name.trim();
  setSavedUsername(trimmed);
  if (!trimmed) return;
  if (!session) {
    return;
  }
  await client.updateAccount(session, { username: trimmed });
}

export async function findMatch(mode: "classic" | "timed"): Promise<string> {
  const sess = await authenticate();
  const res = await client.rpc(sess, "find_match", { mode });
  const data = res.payload as { matchId: string };
  return data.matchId;
}

export interface RoomInfo {
  matchId: string;
  players: number;
  mode: "classic" | "timed";
}

export async function listRooms(): Promise<RoomInfo[]> {
  const sess = await authenticate();
  const res = await client.rpc(sess, "list_rooms", {});
  const data = res.payload as { rooms: RoomInfo[] };
  return data.rooms || [];
}

export async function createRoom(mode: "classic" | "timed"): Promise<string> {
  const sess = await authenticate();
  const res = await client.rpc(sess, "create_room", { mode });
  const data = res.payload as { matchId: string };
  return data.matchId;
}

export async function getLeaderboard(): Promise<any[]> {
  const sess = await authenticate();
  const res = await client.rpc(sess, "get_leaderboard", {});
  const data = res.payload as { records: any[] };
  return data.records || [];
}

export async function getPlayerStats(): Promise<{ wins: number; losses: number; draws: number; streak: number }> {
  const sess = await authenticate();
  const res = await client.rpc(sess, "get_player_stats", {});
  return res.payload as { wins: number; losses: number; draws: number; streak: number };
}
