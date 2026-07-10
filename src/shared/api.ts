// Shared API types between client and server

export const GRID_SIZE = 12;
export const ECHO_FADE = 0.22; // lightness reduction per BFS step
export const RATE_LIMIT_SECONDS = 60; // one tile per minute per user
export const COVERAGE_WIN_THRESHOLD = 0.80; // 80% filled = community win

// ──────────────────────────────────────────────────────────────
// Color palette (HSL hue values — rendered as vivid colors)
// ──────────────────────────────────────────────────────────────
export const ECHO_COLORS = [
  { id: 0, name: 'Crimson',  hue: 0   },
  { id: 1, name: 'Ember',    hue: 25  },
  { id: 2, name: 'Gold',     hue: 48  },
  { id: 3, name: 'Lime',     hue: 105 },
  { id: 4, name: 'Teal',     hue: 175 },
  { id: 5, name: 'Azure',    hue: 210 },
  { id: 6, name: 'Violet',   hue: 270 },
  { id: 7, name: 'Rose',     hue: 330 },
] as const;

export type ColorId = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

// ──────────────────────────────────────────────────────────────
// Grid state types
// ──────────────────────────────────────────────────────────────

/** A single grid cell's state */
export type CellState = {
  colorId: ColorId;
  /** 0 = primary tile placed by a user; 1–N = echo distance from source */
  echoDepth: number;
  /** username who placed the primary tile that triggered this echo */
  placedBy: string;
  /** Is this a resonance cell (two echoes met)? */
  resonance: boolean;
};

export type GridState = {
  /** ISO date string YYYY-MM-DD */
  date: string;
  /** Cell key "r,c" → CellState */
  cells: Record<string, CellState>;
  /** 0–1 fraction of cells filled */
  coverage: number;
  /** true when coverage >= threshold and community won */
  resolved: boolean;
  /** Total placements made today */
  totalPlacements: number;
};

// ──────────────────────────────────────────────────────────────
// API request / response types
// ──────────────────────────────────────────────────────────────

export type InitResponse = {
  type: 'init';
  username: string;
  grid: GridState;
  userStreak: number;
  userXP: number;
  userRank: string;
  rateLimitRemaining: number; // seconds until next placement allowed (0 = can place)
  leaderboard: LeaderboardEntry[];
};

export type PlaceTileRequest = {
  row: number;
  col: number;
  colorId: ColorId;
};

export type PlaceTileResponse =
  | {
      type: 'placed';
      affectedCells: Record<string, CellState>;
      coverage: number;
      xpGained: number;
      resolved: boolean;
      streakUpdated: boolean;
    }
  | {
      type: 'error';
      reason: 'rate_limit' | 'cell_occupied' | 'grid_resolved' | 'out_of_bounds' | 'unknown';
      retryAfter?: number; // seconds
    };

export type RealtimeEvent =
  | {
      type: 'tile_placed';
      affectedCells: Record<string, CellState>;
      coverage: number;
      resolved: boolean;
      placedBy: string;
    }
  | {
      type: 'grid_resolved';
      coverage: number;
      totalPlacements: number;
    }
  | {
      type: 'new_day';
      grid: GridState;
    };

export type LeaderboardEntry = {
  username: string;
  xp: number;
  rank: string;
  streak: number;
};

export type VoteShapeRequest = {
  shapeId: string;
};

export type VoteShapeResponse = {
  type: 'voted';
  votes: Record<string, number>;
};

// Rank thresholds
export const RANKS = [
  { name: 'Static',    minXP: 0    },
  { name: 'Ripple',    minXP: 100  },
  { name: 'Wave',      minXP: 300  },
  { name: 'Current',   minXP: 700  },
  { name: 'Surge',     minXP: 1500 },
  { name: 'Resonance', minXP: 3000 },
] as const;

export function getRank(xp: number): string {
  for (let i = RANKS.length - 1; i >= 0; i--) {
    if (xp >= RANKS[i].minXP) return RANKS[i].name;
  }
  return 'Static';
}
