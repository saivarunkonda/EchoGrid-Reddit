import type { CellState, ColorId, GridState } from '../../shared/api';
import { GRID_SIZE, ECHO_FADE, ECHO_COLORS } from '../../shared/api';

// ──────────────────────────────────────────────────────────────
// Color math helpers
// ──────────────────────────────────────────────────────────────

/**
 * Build an HSL color string for a cell.
 * Primary tiles are fully saturated; echoes fade with depth.
 */
export function cellToHSL(cell: CellState): string {
  const colorDef = ECHO_COLORS[cell.colorId];
  if (cell.resonance) {
    // Blended resonance cells get a desaturated golden shimmer
    return `hsl(${colorDef.hue}, 40%, 60%)`;
  }
  const saturation = Math.max(20, 90 - cell.echoDepth * 15);
  const lightness = Math.min(85, 40 + cell.echoDepth * (ECHO_FADE * 100));
  return `hsl(${colorDef.hue}, ${saturation}%, ${lightness}%)`;
}

/**
 * Returns a hex string for Phaser (0xRRGGBB).
 */
export function hslToHex(h: number, s: number, l: number): number {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color);
  };
  return (f(0) << 16) | (f(8) << 8) | f(4);
}

export function cellToHex(cell: CellState): number {
  const colorDef = ECHO_COLORS[cell.colorId];
  if (cell.resonance) {
    return hslToHex(colorDef.hue, 40, 60);
  }
  const saturation = Math.max(20, 90 - cell.echoDepth * 15);
  const lightness = Math.min(85, 40 + cell.echoDepth * (ECHO_FADE * 100));
  return hslToHex(colorDef.hue, saturation, lightness);
}

export function colorIdToHex(colorId: ColorId, depth = 0): number {
  const colorDef = ECHO_COLORS[colorId];
  const saturation = Math.max(20, 90 - depth * 15);
  const lightness = Math.min(85, 40 + depth * (ECHO_FADE * 100));
  return hslToHex(colorDef.hue, saturation, lightness);
}

// ──────────────────────────────────────────────────────────────
// Grid coordinate helpers
// ──────────────────────────────────────────────────────────────

export function cellKey(row: number, col: number): string {
  return `${row},${col}`;
}

export function parseKey(key: string): [number, number] {
  const [r, c] = key.split(',').map(Number);
  return [r, c];
}

export function isInBounds(row: number, col: number): boolean {
  return row >= 0 && row < GRID_SIZE && col >= 0 && col < GRID_SIZE;
}

export const NEIGHBORS_4 = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
] as const;

export const NEIGHBORS_8 = [
  [-1, 0], [1, 0], [0, -1], [0, 1],
  [-1, -1], [-1, 1], [1, -1], [1, 1],
] as const;

// ──────────────────────────────────────────────────────────────
// BFS echo propagation (pure / client-side mirror)
// Used for optimistic UI updates before server confirms
// ──────────────────────────────────────────────────────────────

export function propagateEchoClient(
  existingCells: Record<string, CellState>,
  startRow: number,
  startCol: number,
  colorId: ColorId,
  placedBy: string,
  maxDepth = 6
): Record<string, CellState> {
  const result: Record<string, CellState> = {};

  // Primary tile
  const primaryKey = cellKey(startRow, startCol);
  result[primaryKey] = {
    colorId,
    echoDepth: 0,
    placedBy,
    resonance: false,
  };

  // BFS
  const queue: Array<[number, number, number]> = [[startRow, startCol, 0]];
  const visited = new Set<string>([primaryKey]);

  while (queue.length > 0) {
    const [r, c, depth] = queue.shift()!;
    if (depth >= maxDepth) continue;

    for (const [dr, dc] of NEIGHBORS_4) {
      const nr = r + dr;
      const nc = c + dc;
      if (!isInBounds(nr, nc)) continue;

      const key = cellKey(nr, nc);
      if (visited.has(key)) continue;
      visited.add(key);

      const existing = existingCells[key];
      const nextDepth = depth + 1;

      if (existing && existing.echoDepth === 0) {
        // Hit another primary tile — create resonance at boundary
        result[key] = { ...existing, resonance: true };
        continue; // Don't propagate through primaries
      }

      if (existing && existing.echoDepth > 0 && existing.echoDepth <= nextDepth) {
        // Existing echo is deeper/equal — resonance
        result[key] = { ...existing, resonance: true };
        continue;
      }

      result[key] = {
        colorId,
        echoDepth: nextDepth,
        placedBy,
        resonance: false,
      };

      queue.push([nr, nc, nextDepth]);
    }
  }

  return result;
}

// ──────────────────────────────────────────────────────────────
// Coverage calculation
// ──────────────────────────────────────────────────────────────

export function calcCoverage(cells: Record<string, CellState>): number {
  const filled = Object.keys(cells).length;
  const total = GRID_SIZE * GRID_SIZE;
  return filled / total;
}

// ──────────────────────────────────────────────────────────────
// Empty grid factory
// ──────────────────────────────────────────────────────────────

export function emptyGrid(date: string): GridState {
  return {
    date,
    cells: {},
    coverage: 0,
    resolved: false,
    totalPlacements: 0,
  };
}
