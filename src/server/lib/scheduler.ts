import { redis } from '@devvit/web/server';
import { todayDateStr, loadGrid, saveGrid } from './gameEngine';
import type { GridState } from '../../shared/api';

// ─────────────────────────────────────────────────
// Scheduled Jobs
// ─────────────────────────────────────────────────

function emptyGrid(date: string): GridState {
  return {
    date,
    cells: {},
    coverage: 0,
    resolved: false,
    totalPlacements: 0,
  };
}

/**
 * Initialize the grid for the next day at midnight UTC.
 * This ensures the grid is ready when the new day starts.
 * 
 * Devvit will call this function based on the schedule defined in devvit.json
 */
export async function initializeNextDayGrid(): Promise<void> {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowDate = tomorrow.toISOString().slice(0, 10); // YYYY-MM-DD

  console.log(`[Scheduler] Initializing grid for ${tomorrowDate}`);

  // Check if grid already exists
  try {
    const existingGrid = await loadGrid(tomorrowDate);
    if (Object.keys(existingGrid.cells).length > 0) {
      console.log(`[Scheduler] Grid for ${tomorrowDate} already exists, skipping`);
      return;
    }
  } catch {
    // Grid doesn't exist yet, which is expected
  }

  // Create empty grid for tomorrow
  const newGrid = emptyGrid(tomorrowDate);
  await saveGrid(tomorrowDate, newGrid);

  console.log(`[Scheduler] Grid initialized for ${tomorrowDate}`);
}

/**
 * Cleanup old grid data (older than 30 days) to save Redis space.
 * This can run daily at a low-traffic time.
 */
export async function cleanupOldGrids(): Promise<void> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 30);
  const cutoffStr = cutoffDate.toISOString().slice(0, 10);

  console.log(`[Scheduler] Cleaning up grids older than ${cutoffStr}`);

  // In a real implementation, you would:
  // 1. Scan for all grid:* keys
  // 2. Delete those older than the cutoff
  // 3. This requires Redis SCAN which is more complex
  
  // For now, this is a placeholder for the cleanup logic
  console.log(`[Scheduler] Cleanup placeholder - would delete grids before ${cutoffStr}`);
}
