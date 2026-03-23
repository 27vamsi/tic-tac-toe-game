# Multiplayer Tic-Tac-Toe

A production-ready, real-time multiplayer Tic-Tac-Toe game with server-authoritative architecture built using **React** (frontend) and **Nakama** (backend game server).

## Features

### Core
- **Server-Authoritative Game Logic** — All game state (board, turns, win detection) managed on the server. Moves are validated server-side before applying (position bounds, cell availability, turn order). Clients cannot manipulate game state.
- **Matchmaking System** — Automatic matchmaking (find an open game or create one), game room creation, room discovery and joining via room browser.
- **Real-Time Gameplay** — Game state broadcast to both players via WebSocket on every move. Player info, turn status, and match status displayed in real time.
- **Disconnection Handling** — If a player disconnects mid-game, the opponent is awarded the win. Rematch requests are cleared on disconnect. Auto-reconnection on the client side.

### Bonus Features
- **Concurrent Game Support** — Nakama handles multiple simultaneous matches with proper room isolation. Each match runs independently with its own state.
- **Leaderboard System** — Tracks wins, losses, draws, and win/loss streaks. Global ranking (top 20) displayed with player statistics. Data persisted in CockroachDB.
- **Timer-Based Game Mode** — Two modes: Classic and Timed (30s per move). Idle warning at 30s, automatic forfeit after 60s of continued inactivity. Countdown timers displayed in the UI. Mode selection in matchmaking and room creation.
- **Rematch System** — After a game ends, either player can request a rematch. The opponent is prompted to accept or decline. On accept, the game resets in-place with swapped marks (fairness). If the opponent leaves, the remaining player is notified.

### Additional
- **Player Profiles** — Custom username with persistence across sessions (localStorage + Nakama account sync).
- **Responsive UI** — Mobile-optimized with CSS breakpoints. Clean dark theme.
- **Auto-Reconnection** — Client automatically reconnects on WebSocket drop with session recovery.

## Architecture

```
┌─────────────┐        WebSocket         ┌─────────────────┐        SQL         ┌──────────────┐
│  React App  │ ◄─────────────────────► │   Nakama Server  │ ◄──────────────► │  CockroachDB │
│  (Vite)     │   Real-time match data   │   (Game Logic)   │   Leaderboard,   │              │
│             │   RPC calls (HTTP)       │   TypeScript     │   Player Stats,  │              │
│             │                          │   Runtime        │   Sessions       │              │
└─────────────┘                          └─────────────────┘                   └──────────────┘
```

### Design Decisions

- **Server-authoritative**: All game logic runs in Nakama's TypeScript runtime (match handler). The client sends intents (move requests, rematch requests), and the server validates and broadcasts state. This prevents cheating.
- **Nakama match system**: Uses Nakama's built-in authoritative match handler (`registerMatch`) for game lifecycle (init, join, leave, loop, terminate). The `matchLoop` runs at 5 ticks/second for idle/forfeit checks.
- **CockroachDB**: Used as Nakama's backing store. Leaderboard records and player stats are persisted and survive server restarts.
- **Rematch via in-place reset**: Instead of creating a new match, rematch resets the existing match state. This avoids coordination complexity and keeps players in the same WebSocket connection.

### Server Modules

| File | Purpose |
|------|---------|
| `server/src/types.ts` | Game state types, OpCodes (MOVE, STATE, REMATCH_REQUEST, REMATCH_DECLINED), enums |
| `server/src/match_handler.ts` | Core game loop — match init, join, leave, move validation, win detection, idle/forfeit, rematch, leaderboard updates |
| `server/src/matchmaking.ts` | RPCs: `find_match`, `list_rooms`, `create_room` |
| `server/src/leaderboard.ts` | Leaderboard init, RPCs: `get_leaderboard`, `get_player_stats` |
| `server/src/main.ts` | Module entry point — registers match handler and RPCs |

### Client Components

| File | Purpose |
|------|---------|
| `client/src/nakama.ts` | Nakama client setup, authentication, socket management, RPC wrappers |
| `client/src/hooks/useNakama.ts` | Connection lifecycle with auto-reconnect |
| `client/src/hooks/useMatch.ts` | Match state management, move/rematch actions |
| `client/src/App.tsx` | Main game screen — board, game info, result card with rematch |
| `client/src/components/Lobby.tsx` | Lobby — name input, mode selection, find match, room browser |
| `client/src/components/Board.tsx` | 3x3 game board with winning cell highlights |
| `client/src/components/GameInfo.tsx` | Player info, turn status, timers, idle warnings |
| `client/src/components/Leaderboard.tsx` | Top 20 leaderboard table |

## Setup & Installation

### Prerequisites
- [Docker](https://docs.docker.com/get-docker/) & Docker Compose
- [Node.js](https://nodejs.org/) (v18+) & npm

### 1. Clone the repository

```bash
git clone <repo-url>
cd tic-tac-toe
```

### 2. Build the server module

```bash
cd server
npm install
npm run build
cd ..
```

This compiles the TypeScript game logic into `server/build/index.js`, which Nakama loads as a JavaScript runtime module.

### 3. Start the backend

```bash
docker-compose up -d
```

This starts:
| Service | Port | Description |
|---------|------|-------------|
| CockroachDB | 26257 | SQL database |
| CockroachDB UI | 8080 | Database admin console |
| Nakama HTTP API | 7350 | REST/RPC endpoint |
| Nakama gRPC | 7349 | gRPC endpoint |
| Nakama Console | 7351 | Server admin console |

Wait a few seconds for CockroachDB health check to pass and Nakama to run migrations.

### 4. Start the frontend

```bash
cd client
npm install
npm run dev
```

The app runs at `http://localhost:5173`.

## API / Server Configuration

### Nakama Server Config (docker-compose.yml)

| Setting | Value | Description |
|---------|-------|-------------|
| `session.token_expiry_sec` | 7200 | Session tokens valid for 2 hours |
| `match.max_empty_sec` | 60 | Empty matches auto-terminate after 60s |
| `logger.level` | DEBUG | Full debug logging |

### Client Environment Variables

Set these in `client/.env` or as environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_NAKAMA_HOST` | `127.0.0.1` | Nakama server hostname |
| `VITE_NAKAMA_PORT` | `7350` | Nakama HTTP API port |
| `VITE_NAKAMA_SSL` | `false` | Enable HTTPS/WSS |
| `VITE_NAKAMA_KEY` | `defaultkey` | Nakama server key |

### RPC Endpoints

| RPC | Auth | Payload | Description |
|-----|------|---------|-------------|
| `find_match` | Yes | `{ mode: "classic" \| "timed" }` | Find or create a match |
| `create_room` | Yes | `{ mode: "classic" \| "timed" }` | Create a new room |
| `list_rooms` | Yes | `{}` | List open rooms |
| `get_leaderboard` | Yes | `{}` | Top 20 leaderboard |
| `get_player_stats` | Yes | `{}` | Current player's stats |

### Match OpCodes

| OpCode | Value | Direction | Description |
|--------|-------|-----------|-------------|
| MOVE | 1 | Client → Server | Player makes a move `{ position: 0-8 }` |
| STATE | 2 | Server → Client | Full game state broadcast |
| REMATCH_REQUEST | 4 | Client → Server | Request rematch |
| REMATCH_DECLINED | 5 | Client → Server | Decline rematch |

## Deployment

### Backend Deployment

1. Provision a VM (e.g., AWS EC2, DigitalOcean Droplet, GCP Compute Engine) with Docker installed.

2. Copy the project files to the server:
   ```bash
   scp -r server/ docker-compose.yml user@your-server:/app/
   ```

3. On the server, start the services:
   ```bash
   cd /app
   docker-compose up -d
   ```

4. Ensure ports 7350 (API) and 7351 (console) are open in your firewall/security group.

5. For production, update `docker-compose.yml`:
   - Set a custom `--session.encryption_key` for secure tokens
   - Set `--logger.level` to `INFO`
   - Configure HTTPS with a reverse proxy (Nginx/Caddy)

### Frontend Deployment

1. Set environment variables pointing to your deployed Nakama server:
   ```bash
   VITE_NAKAMA_HOST=your-server-ip
   VITE_NAKAMA_PORT=7350
   VITE_NAKAMA_SSL=true  # if behind HTTPS
   ```

2. Build the production bundle:
   ```bash
   cd client
   npm run build
   ```

3. Deploy the `client/dist/` folder to any static hosting:
   - **Vercel**: `npx vercel --prod`
   - **Netlify**: drag-and-drop `dist/` or use CLI
   - **Nginx**: serve `dist/` as static files
   - **S3 + CloudFront**: upload to S3, configure CloudFront distribution

## Testing Multiplayer

### Local Testing (Two Players)

1. Start the backend and frontend as described above.
2. Open `http://localhost:5173` in one browser tab.
3. Open `http://localhost:5173?player=2` in another tab (or incognito window).
   - The `?player=2` parameter creates a separate device identity so you can play as two different players.
4. In both tabs, enter a player name and click **Save**.
5. In one tab, click **Find Match** (or **Create Room**).
6. In the other tab, click **Find Match** (or **Join** the room from the room list).
7. Play the game — moves appear in real time on both sides.

### What to Test

- **Moves**: Verify moves are reflected on both clients instantly. Try clicking occupied cells or out-of-turn — they should be rejected.
- **Win/Draw**: Play to a win or draw. Verify the result card shows correctly on both sides.
- **Rematch**: After a game ends, click Rematch on one side. Verify the other side sees the prompt. Accept and verify the board resets with swapped marks.
- **Disconnect**: Close one tab mid-game. Verify the other player is awarded the win.
- **Timer mode**: Select "Timed (30s)" and find a match. Wait 30s without moving — verify the idle warning appears. Wait another 60s — verify automatic forfeit.
- **Leaderboard**: After playing a few games, check the leaderboard in the lobby. Verify wins, losses, draws, and streaks are tracked correctly.
- **Reconnection**: While in the lobby, restart Nakama (`docker-compose restart nakama`). Verify the client reconnects automatically within a few seconds.
