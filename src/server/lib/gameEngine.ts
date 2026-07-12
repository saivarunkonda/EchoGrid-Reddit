import type { CellState, ColorId, GridState } from '../../shared/api';
import {
  GRID_SIZE,
  ECHO_FADE,
  ECHO_COLORS,
  COVERAGE_WIN_THRESHOLD,
  RATE_LIMIT_SECONDS,
} from '../../shared/api';
import { cellKey, isInBounds, NEIGHBORS_4 } from '../../client/utils/gridMath';
import { redis, context, reddit } from '@devvit/web/server';
import { getRank } from '../../shared/api';

// ─────────────────────────────────────────────────
// Redis key helpers
// ─────────────────────────────────────────────────

export function todayDateStr(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function gridCellsKey(date: string) {
  return `grid:${date}:cells`;
}
function gridMetaKey(date: string) {
  return `grid:${date}:meta`;
}
function rateLimitKey(date: string, userId: string) {
  return `ratelimit:${date}:${userId}`;
}
function userKey(userId: string) {
  return `user:${userId}`;
}
function leaderboardKey(date: string) {
  return `leaderboard:${date}`;
}
function seasonLeaderboardKey() {
  return `leaderboard:season`;
}

// ─────────────────────────────────────────────────
// Grid Redis operations
// ─────────────────────────────────────────────────

export async function loadGrid(date: string): Promise<GridState> {
  const [cellsRaw, metaRaw] = await Promise.all([
    redis.get(gridCellsKey(date)),
    redis.get(gridMetaKey(date)),
  ]);

  const cells: Record<string, CellState> = cellsRaw ? JSON.parse(cellsRaw) : {};
  const meta = metaRaw ? JSON.parse(metaRaw) : { coverage: 0, resolved: false, totalPlacements: 0 };

  return {
    date,
    cells,
    coverage: meta.coverage,
    resolved: meta.resolved,
    totalPlacements: meta.totalPlacements,
  };
}

export async function saveGrid(date: string, grid: GridState): Promise<void> {
  await Promise.all([
    redis.set(gridCellsKey(date), JSON.stringify(grid.cells)),
    redis.set(
      gridMetaKey(date),
      JSON.stringify({
        coverage: grid.coverage,
        resolved: grid.resolved,
        totalPlacements: grid.totalPlacements,
      })
    ),
  ]);
}

// ─────────────────────────────────────────────────
// Rate limiting
// ─────────────────────────────────────────────────

/** Returns 0 if the user can place. Otherwise seconds remaining. */
export async function getRateLimitRemaining(date: string, userId: string): Promise<number> {
  const key = rateLimitKey(date, userId);
  const lastPlaced = await redis.get(key);
  if (!lastPlaced) return 0;

  const elapsed = Math.floor((Date.now() - Number(lastPlaced)) / 1000);
  return Math.max(0, RATE_LIMIT_SECONDS - elapsed);
}

export async function setRateLimit(date: string, userId: string): Promise<void> {
  const key = rateLimitKey(date, userId);
  await redis.set(key, String(Date.now()), { ex: RATE_LIMIT_SECONDS + 5 });
}

// ─────────────────────────────────────────────────
// Echo propagation (authoritative server version)
// ─────────────────────────────────────────────────

const MAX_ECHO_DEPTH = 6;

export function propagateEchoServer(
  existingCells: Record<string, CellState>,
  startRow: number,
  startCol: number,
  colorId: ColorId,
  placedBy: string
): Record<string, CellState> {
  const newCells: Record<string, CellState> = { ...existingCells };
  const affected: Record<string, CellState> = {};

  const primaryKey = cellKey(startRow, startCol);
  const primary: CellState = { colorId, echoDepth: 0, placedBy, resonance: false };
  newCells[primaryKey] = primary;
  affected[primaryKey] = primary;

  const queue: Array<[number, number, number]> = [[startRow, startCol, 0]];
  const visited = new Set<string>([primaryKey]);

  while (queue.length > 0) {
    const [r, c, depth] = queue.shift()!;
    if (depth >= MAX_ECHO_DEPTH) continue;

    for (const [dr, dc] of NEIGHBORS_4) {
      const nr = r + dr;
      const nc = c + dc;
      if (!isInBounds(nr, nc)) continue;

      const key = cellKey(nr, nc);
      if (visited.has(key)) continue;
      visited.add(key);

      const existing = newCells[key];
      const nextDepth = depth + 1;

      if (existing) {
        if (existing.echoDepth === 0) {
          // Hit primary tile of someone else → resonance at boundary
          const resonant = { ...existing, resonance: true };
          newCells[key] = resonant;
          affected[key] = resonant;
          continue;
        }
        if (existing.colorId === colorId) {
          // Same color echo — extend if shallower
          if (nextDepth < existing.echoDepth) {
            const cell: CellState = { colorId, echoDepth: nextDepth, placedBy, resonance: false };
            newCells[key] = cell;
            affected[key] = cell;
            queue.push([nr, nc, nextDepth]);
          }
          continue;
        }
        // Different color echo — resonance
        const resonant = { ...existing, resonance: true };
        newCells[key] = resonant;
        affected[key] = resonant;
        continue;
      }

      // Empty cell
      const cell: CellState = { colorId, echoDepth: nextDepth, placedBy, resonance: false };
      newCells[key] = cell;
      affected[key] = cell;
      queue.push([nr, nc, nextDepth]);
    }
  }

  return affected; // Return only the changed cells for realtime broadcast
}

// ─────────────────────────────────────────────────
// User stats
// ─────────────────────────────────────────────────

export type UserStats = {
  xp: number;
  streak: number;
  longestStreak: number;
  lastPlayed: string;
  rank: string;
};

export async function getUserStats(userId: string): Promise<UserStats> {
  const raw = await redis.get(userKey(userId));
  if (!raw) {
    return { xp: 0, streak: 0, longestStreak: 0, lastPlayed: '', rank: 'Static' };
  }
  const data = JSON.parse(raw);
  return {
    xp: data.xp ?? 0,
    streak: data.streak ?? 0,
    longestStreak: data.longestStreak ?? 0,
    lastPlayed: data.lastPlayed ?? '',
    rank: getRank(data.xp ?? 0),
  };
}

/** Returns { xpGained, streakUpdated } */
export async function awardXP(
  userId: string,
  baseXP: number,
  date: string
): Promise<{ xpGained: number; streakUpdated: boolean }> {
  const stats = await getUserStats(userId);
  const today = date;
  const yesterday = new Date(new Date(today).getTime() - 86400000).toISOString().slice(0, 10);

  let { streak, longestStreak, xp, lastPlayed } = { ...stats, xp: stats.xp };

  let streakUpdated = false;

  if (lastPlayed === today) {
    // Already played today — no streak update, but still award XP
  } else if (lastPlayed === yesterday) {
    streak += 1;
    if (streak > longestStreak) longestStreak = streak;
    streakUpdated = true;
  } else {
    streak = 1;
    streakUpdated = true;
  }

  lastPlayed = today;

  // Streak multiplier
  const multiplier = Math.min(3, 1 + (streak - 1) * 0.1);
  const xpGained = Math.round(baseXP * multiplier);
  xp += xpGained;

  // Update leaderboards
  await Promise.all([
    redis.set(
      userKey(userId),
      JSON.stringify({ xp, streak, longestStreak, lastPlayed })
    ),
    // Daily leaderboard (zadd — higher = better)
    redis.zAdd(leaderboardKey(today), { score: xp, member: userId }),
    // Season leaderboard
    redis.zAdd(seasonLeaderboardKey(), { score: xp, member: userId }),
  ]);

  return { xpGained, streakUpdated };
}

// ─────────────────────────────────────────────────
// Leaderboard
// ─────────────────────────────────────────────────

export async function getLeaderboard(date: string, limit = 10) {
  // Get top N by descending score
  const entries = await redis.zRange(leaderboardKey(date), 0, limit - 1, { rev: true, withScores: true });
  const results = [];
  for (let i = 0; i < entries.length; i += 2) {
    const userId = entries[i] as string;
    const score = Number(entries[i + 1]);
    const stats = await getUserStats(userId);
    results.push({
      username: userId, // userId IS the username in Devvit context
      xp: score,
      rank: stats.rank,
      streak: stats.streak,
    });
  }
  return results;
}
