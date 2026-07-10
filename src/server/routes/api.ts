import { Hono } from 'hono';
import { context, redis, reddit } from '@devvit/web/server';
import type {
  InitResponse,
  PlaceTileRequest,
  PlaceTileResponse,
  RealtimeEvent,
  VoteShapeRequest,
  VoteShapeResponse,
} from '../../shared/api';
import { COVERAGE_WIN_THRESHOLD, GRID_SIZE } from '../../shared/api';
import {
  todayDateStr,
  loadGrid,
  saveGrid,
  getRateLimitRemaining,
  setRateLimit,
  propagateEchoServer,
  getUserStats,
  awardXP,
  getLeaderboard,
} from '../lib/gameEngine';
import { cellKey } from '../../client/utils/gridMath';

export const api = new Hono();

// ─────────────────────────────────────────────────
// GET /api/init — Load all initial state
// ─────────────────────────────────────────────────
api.get('/init', async (c) => {
  try {
    const userId = context.userId ?? 'anonymous';
    const date = todayDateStr();

    const [grid, stats, rateLimitRemaining, leaderboard] = await Promise.all([
      loadGrid(date),
      getUserStats(userId),
      getRateLimitRemaining(date, userId),
      getLeaderboard(date, 10),
    ]);

    // Fetch Reddit username
    let username = userId;
    try {
      const user = await reddit.getCurrentUser();
      username = user?.username ?? userId;
    } catch {
      // Gracefully degrade
    }

    const response: InitResponse = {
      type: 'init',
      username,
      grid,
      userStreak: stats.streak,
      userXP: stats.xp,
      userRank: stats.rank,
      rateLimitRemaining,
      leaderboard,
    };

    return c.json(response);
  } catch (e) {
    console.error('Init error:', e);
    return c.json({ type: 'error', message: String(e) }, 500);
  }
});

// ─────────────────────────────────────────────────
// POST /api/place-tile — Place a tile on the grid
// ─────────────────────────────────────────────────
api.post('/place-tile', async (c) => {
  const userId = context.userId;
  if (!userId) {
    const resp: PlaceTileResponse = { type: 'error', reason: 'unknown' };
    return c.json(resp, 401);
  }

  let body: PlaceTileRequest;
  try {
    body = await c.req.json<PlaceTileRequest>();
  } catch {
    return c.json({ type: 'error', reason: 'unknown' }, 400);
  }

  const { row, col, colorId } = body;

  // Bounds check
  if (row < 0 || row >= GRID_SIZE || col < 0 || col >= GRID_SIZE) {
    const resp: PlaceTileResponse = { type: 'error', reason: 'out_of_bounds' };
    return c.json(resp, 400);
  }

  const date = todayDateStr();

  // Rate limit check
  const rateLimitRemaining = await getRateLimitRemaining(date, userId);
  if (rateLimitRemaining > 0) {
    const resp: PlaceTileResponse = {
      type: 'error',
      reason: 'rate_limit',
      retryAfter: rateLimitRemaining,
    };
    return c.json(resp, 429);
  }

  // Load current grid
  const grid = await loadGrid(date);

  if (grid.resolved) {
    const resp: PlaceTileResponse = { type: 'error', reason: 'grid_resolved' };
    return c.json(resp, 409);
  }

  // Check if primary cell is occupied
  const key = cellKey(row, col);
  if (grid.cells[key] && grid.cells[key].echoDepth === 0) {
    const resp: PlaceTileResponse = { type: 'error', reason: 'cell_occupied' };
    return c.json(resp, 409);
  }

  // Fetch username for display
  let username = userId;
  try {
    const user = await reddit.getCurrentUser();
    username = user?.username ?? userId;
  } catch {}

  // Propagate echo
  const affectedCells = propagateEchoServer(grid.cells, row, col, colorId, username);

  // Merge into grid
  Object.assign(grid.cells, affectedCells);

  // Update coverage
  const totalCells = GRID_SIZE * GRID_SIZE;
  grid.coverage = Object.keys(grid.cells).length / totalCells;
  grid.totalPlacements += 1;

  // Check win condition
  const resolved = grid.coverage >= COVERAGE_WIN_THRESHOLD;
  grid.resolved = resolved;

  // Save grid + rate limit in parallel
  const [, { xpGained, streakUpdated }] = await Promise.all([
    saveGrid(date, grid),
    awardXP(userId, 10 + (resolved ? 50 : 0), date),
    setRateLimit(date, userId),
  ]);

  // Broadcast via Devvit Realtime
  const realtimeEvent: RealtimeEvent = resolved
    ? {
        type: 'grid_resolved',
        coverage: grid.coverage,
        totalPlacements: grid.totalPlacements,
      }
    : {
        type: 'tile_placed',
        affectedCells,
        coverage: grid.coverage,
        resolved: false,
        placedBy: username,
      };

  try {
    await context.realtime.send('echogrid', JSON.stringify(realtimeEvent));
  } catch (e) {
    console.warn('Realtime send failed:', e);
  }

  const resp: PlaceTileResponse = {
    type: 'placed',
    affectedCells,
    coverage: grid.coverage,
    xpGained,
    resolved,
    streakUpdated,
  };

  return c.json(resp);
});

// ─────────────────────────────────────────────────
// POST /api/vote-shape — Vote for tomorrow's grid shape
// ─────────────────────────────────────────────────
api.post('/vote-shape', async (c) => {
  const userId = context.userId;
  if (!userId) return c.json({ type: 'error', message: 'Not logged in' }, 401);

  let body: VoteShapeRequest;
  try {
    body = await c.req.json<VoteShapeRequest>();
  } catch {
    return c.json({ type: 'error', message: 'Invalid body' }, 400);
  }

  const { shapeId } = body;
  const allowedShapes = ['standard', 'spiral', 'cross', 'diamond', 'blob'];
  if (!allowedShapes.includes(shapeId)) {
    return c.json({ type: 'error', message: 'Invalid shape' }, 400);
  }

  const voteKey = `vote:shape:${todayDateStr()}`;
  // Remove any previous vote by this user (store user→shape mapping)
  const userVoteKey = `vote:${userId}:today`;
  const prevVote = await redis.get(userVoteKey);
  if (prevVote) {
    await redis.hIncrBy(voteKey, prevVote, -1);
  }

  await Promise.all([
    redis.hIncrBy(voteKey, shapeId, 1),
    redis.set(userVoteKey, shapeId, { ex: 86400 }),
  ]);

  // Return current vote tallies
  const rawVotes = await redis.hGetAll(voteKey);
  const votes: Record<string, number> = {};
  for (const [k, v] of Object.entries(rawVotes ?? {})) {
    votes[k] = Number(v);
  }

  const resp: VoteShapeResponse = { type: 'voted', votes };
  return c.json(resp);
});

// ─────────────────────────────────────────────────
// GET /api/leaderboard — Fetch leaderboard
// ─────────────────────────────────────────────────
api.get('/leaderboard', async (c) => {
  const date = todayDateStr();
  const board = await getLeaderboard(date, 20);
  return c.json({ type: 'leaderboard', entries: board });
});
