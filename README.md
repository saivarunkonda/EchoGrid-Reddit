# EchoGrid

A daily community wave puzzle embedded in Reddit posts. Players place colored "echo tiles" that ripple outward like waves, interacting with tiles other Redditors placed before them. Together, the community races to fill the grid with harmonious echoes by midnight.

## 🎮 Features

- **Daily Grid Puzzle**: A new 12×12 grid appears each day
- **Echo Propagation**: Placed tiles ripple outward using BFS wave mechanics
- **Real-time Sync**: See other players' tiles appear instantly via Devvit Realtime
- **Community Win**: Grid resolves when 80% coverage is reached
- **Retention Systems**: Streaks, XP, ranks, and leaderboards
- **Beautiful Visuals**: Phaser 3-powered particle effects and animations
- **Rate Limiting**: One tile per minute per user to encourage strategic play

## 🏆 Prize Categories

- **Best App with a Hook**: Daily grid + "did we win today?" loop drives daily returns
- **Best Use of Phaser**: Ripple wave particles, animated grids, day-end replay scene
- **Best Use of Retention**: Streaks, XP, season ranks, flairs, MVP notifications
- **Best Use of UGC**: Community votes on next day's grid shape, players submit puzzle seeds

## 🛠️ Tech Stack

- **Frontend**: React 18 + Phaser 3
- **Backend**: Hono (server framework)
- **Database**: Redis (via Devvit)
- **Platform**: Devvit (Reddit app platform)
- **Build Tool**: Vite
- **Language**: TypeScript

## 📁 Project Structure

```
echogrid/
├── src/
│   ├── client/           # Frontend code
│   │   ├── game.tsx      # Main game component (React + Phaser)
│   │   ├── splash.tsx    # Feed preview component
│   │   ├── scenes/
│   │   │   └── GridScene.ts  # Phaser game scene
│   │   ├── ui/
│   │   │   └── HUD.tsx  # Heads-up display component
│   │   ├── utils/
│   │   │   └── gridMath.ts  # Grid math & echo propagation
│   │   ├── game.html    # Game entry point
│   │   ├── splash.html  # Splash entry point
│   │   └── styles.css    # Global styles
│   ├── server/          # Backend code
│   │   ├── index.ts     # Server entry point
│   │   ├── routes/
│   │   │   ├── api.ts   # API endpoints
│   │   │   └── menu.ts  # Menu action endpoints
│   │   └── lib/
│   │       └── gameEngine.ts  # Game logic & Redis operations
│   └── shared/          # Shared types
│       └── api.ts       # TypeScript types & constants
├── devvit.json          # Devvit configuration
├── package.json         # Dependencies
├── tsconfig.json        # TypeScript config
├── vite.config.ts       # Vite build config
└── .gitignore           # Git ignore rules
```

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- Devvit CLI installed
- Reddit account with Devvit access

### Installation

1. Install dependencies:
```bash
npm install
```

2. Login to Devvit:
```bash
npm run login
```

3. Run development server:
```bash
npm run dev
```

4. Build for production:
```bash
npm run build
```

5. Deploy to Reddit:
```bash
npm run deploy
```

## 🎯 Game Mechanics

### Echo Propagation

When a player places a tile:
1. The primary tile is placed at the selected cell
2. Echoes propagate outward using BFS (Breadth-First Search)
3. Each echo step reduces saturation and increases lightness
4. Echoes stop at depth 6 or when hitting other primary tiles
5. When echoes of different colors meet, they create "resonance" cells

### Coverage & Win Condition

- Grid size: 12×12 (144 cells)
- Win threshold: 80% coverage (115 cells)
- When threshold is reached, the grid "resolves" with a celebration animation
- Players cannot place tiles after resolution

### Rate Limiting

- One tile per minute per user
- Cooldown resets after 60 seconds
- Prevents spam and encourages strategic placement

### XP & Ranks

- Base XP: 10 points per placement
- Streak bonus: +10% per consecutive day played (max 3x)
- Resolution bonus: +50 XP when grid completes
- Ranks: Static → Ripple → Wave → Current → Surge → Resonance

## 🔧 API Endpoints

### `GET /api/init`
Initialize game state and fetch user data.

**Response:**
```typescript
{
  type: 'init';
  username: string;
  grid: GridState;
  userStreak: number;
  userXP: number;
  userRank: string;
  rateLimitRemaining: number;
  leaderboard: LeaderboardEntry[];
}
```

### `POST /api/place-tile`
Place a tile on the grid.

**Request:**
```typescript
{
  row: number;
  col: number;
  colorId: ColorId;
}
```

**Response:**
```typescript
{
  type: 'placed';
  affectedCells: Record<string, CellState>;
  coverage: number;
  xpGained: number;
  resolved: boolean;
  streakUpdated: boolean;
}
```

### `POST /api/vote-shape`
Vote for tomorrow's grid shape.

**Request:**
```typescript
{
  shapeId: string;
}
```

### `GET /api/leaderboard`
Fetch the leaderboard.

### `POST /menu/create-post`
Create a new daily EchoGrid post (moderator action).

## 🎨 Color Palette

EchoGrid uses 8 vibrant colors:

| ID | Name | Hue |
|----|------|-----|
| 0 | Crimson | 0° |
| 1 | Ember | 25° |
| 2 | Gold | 48° |
| 3 | Lime | 105° |
| 4 | Teal | 175° |
| 5 | Azure | 210° |
| 6 | Violet | 270° |
| 7 | Rose | 330° |

## 🔮 Future Enhancements

- [ ] Hex grid support (in addition to square)
- [ ] Audio: ambient harmony tones
- [ ] Shape voting UI component
- [ ] Grid shape variations (spiral, cross, diamond, blob)
- [ ] Season-based challenges
- [ ] Player flairs and badges
- [ ] Replay mode for completed grids
- [ ] MVP notification system

## 📝 License

BSD-3-Clause

## 🤝 Contributing

This is a Devvit app built for the Reddit Devvit Hackathon. Feel free to fork and experiment!

---

Built with ❤️ for the Reddit community
