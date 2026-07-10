import Phaser from 'phaser';
import type { CellState } from '../../shared/api';
import { GRID_SIZE, ECHO_COLORS } from '../../shared/api';
import { cellKey, parseKey, cellToHex, colorIdToHex, propagateEchoClient } from '../utils/gridMath';
import type { ColorId } from '../../shared/api';

const CELL_SIZE = 46;
const GRID_PADDING = 20;
const CANVAS_W = GRID_SIZE * CELL_SIZE + GRID_PADDING * 2;
const CANVAS_H = GRID_SIZE * CELL_SIZE + GRID_PADDING * 2;

// Events emitted to React
export const GAME_EVENTS = {
  TILE_PLACED: 'tile_placed',
  COVERAGE_UPDATE: 'coverage_update',
  GRID_RESOLVED: 'grid_resolved',
  CELL_HOVER: 'cell_hover',
} as const;

type GridSceneEvents = {
  onTilePlaced: (row: number, col: number, colorId: ColorId) => void;
  onCoverageUpdate: (coverage: number) => void;
  onGridResolved: () => void;
};

export class GridScene extends Phaser.Scene {
  private cellGraphics: Map<string, Phaser.GameObjects.Graphics> = new Map();
  private glowGraphics: Map<string, Phaser.GameObjects.Graphics> = new Map();
  private particles: Phaser.GameObjects.Particles.ParticleEmitterManager[] = [];
  private cells: Record<string, CellState> = {};
  private hoverOverlay!: Phaser.GameObjects.Graphics;
  private selectedColorId: ColorId = 0;
  private canPlace = true;
  private username = '';
  private events2!: GridSceneEvents;
  private bgGrid!: Phaser.GameObjects.Graphics;
  private animatingCells: Set<string> = new Set();

  constructor() {
    super({ key: 'GridScene' });
  }

  init(data: { events: GridSceneEvents; username: string }) {
    this.events2 = data.events;
    this.username = data.username;
  }

  create() {
    // Dark gradient background
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x0a0a1a, 0x0a0a1a, 0x12122a, 0x12122a, 1);
    bg.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Draw empty grid lines
    this.bgGrid = this.add.graphics();
    this.drawGridLines();

    // Hover overlay
    this.hoverOverlay = this.add.graphics();

    // Input handling
    this.input.on('pointermove', this.onPointerMove, this);
    this.input.on('pointerdown', this.onPointerDown, this);
    this.input.on('pointerout', () => this.hoverOverlay.clear(), this);

    // Floating particle ambient effect
    this.createAmbientParticles();
  }

  private drawGridLines() {
    this.bgGrid.clear();
    this.bgGrid.lineStyle(1, 0x1e2040, 0.8);

    for (let r = 0; r <= GRID_SIZE; r++) {
      const y = GRID_PADDING + r * CELL_SIZE;
      this.bgGrid.lineBetween(GRID_PADDING, y, GRID_PADDING + GRID_SIZE * CELL_SIZE, y);
    }
    for (let c = 0; c <= GRID_SIZE; c++) {
      const x = GRID_PADDING + c * CELL_SIZE;
      this.bgGrid.lineBetween(x, GRID_PADDING, x, GRID_PADDING + GRID_SIZE * CELL_SIZE);
    }
  }

  private screenToCell(x: number, y: number): [number, number] | null {
    const col = Math.floor((x - GRID_PADDING) / CELL_SIZE);
    const row = Math.floor((y - GRID_PADDING) / CELL_SIZE);
    if (row < 0 || row >= GRID_SIZE || col < 0 || col >= GRID_SIZE) return null;
    return [row, col];
  }

  private cellToScreen(row: number, col: number): [number, number] {
    return [
      GRID_PADDING + col * CELL_SIZE + CELL_SIZE / 2,
      GRID_PADDING + row * CELL_SIZE + CELL_SIZE / 2,
    ];
  }

  private onPointerMove(ptr: Phaser.Input.Pointer) {
    const cell = this.screenToCell(ptr.x, ptr.y);
    this.hoverOverlay.clear();
    if (!cell) return;
    const [row, col] = cell;
    const key = cellKey(row, col);
    // Don't highlight if already a primary tile
    if (this.cells[key]?.echoDepth === 0) return;

    const [cx, cy] = this.cellToScreen(row, col);
    const color = ECHO_COLORS[this.selectedColorId];
    this.hoverOverlay.lineStyle(2, colorIdToHex(this.selectedColorId), 0.9);
    this.hoverOverlay.fillStyle(colorIdToHex(this.selectedColorId), 0.25);
    this.hoverOverlay.fillRoundedRect(cx - CELL_SIZE / 2 + 2, cy - CELL_SIZE / 2 + 2, CELL_SIZE - 4, CELL_SIZE - 4, 4);
    this.hoverOverlay.strokeRoundedRect(cx - CELL_SIZE / 2 + 2, cy - CELL_SIZE / 2 + 2, CELL_SIZE - 4, CELL_SIZE - 4, 4);
  }

  private onPointerDown(ptr: Phaser.Input.Pointer) {
    if (!this.canPlace) return;
    const cell = this.screenToCell(ptr.x, ptr.y);
    if (!cell) return;
    const [row, col] = cell;
    const key = cellKey(row, col);
    if (this.cells[key]?.echoDepth === 0) return; // Primary occupied

    this.events2.onTilePlaced(row, col, this.selectedColorId);
  }

  // ──────────────────────────────────────────────
  // Public API (called from React)
  // ──────────────────────────────────────────────

  setColor(colorId: ColorId) {
    this.selectedColorId = colorId;
  }

  setCanPlace(can: boolean) {
    this.canPlace = can;
    this.input.enabled = can;
  }

  /** Apply grid cells (from server init or realtime update) */
  applyGridState(cells: Record<string, CellState>, animate = false) {
    for (const [key, cell] of Object.entries(cells)) {
      this.renderCell(key, cell, animate && !this.animatingCells.has(key));
      if (animate) this.animatingCells.add(key);
    }
    this.cells = { ...this.cells, ...cells };
  }

  /** Apply realtime update from another player */
  applyRealtimeUpdate(affectedCells: Record<string, CellState>) {
    for (const [key, cell] of Object.entries(affectedCells)) {
      this.renderCell(key, cell, true);
    }
    Object.assign(this.cells, affectedCells);
  }

  /** Optimistic local placement (before server confirms) */
  applyOptimistic(row: number, col: number, colorId: ColorId) {
    const optimisticCells = propagateEchoClient(this.cells, row, col, colorId, this.username);
    this.applyGridState(optimisticCells, true);
  }

  // ──────────────────────────────────────────────
  // Rendering
  // ──────────────────────────────────────────────

  private renderCell(key: string, cell: CellState, animate: boolean) {
    const [row, col] = parseKey(key);
    const [cx, cy] = this.cellToScreen(row, col);
    const color = cellToHex(cell);

    // Destroy old graphics for this cell
    this.cellGraphics.get(key)?.destroy();
    this.glowGraphics.get(key)?.destroy();

    const g = this.add.graphics();
    const glow = this.add.graphics();

    const isPrimary = cell.echoDepth === 0;
    const isResonance = cell.resonance;

    const pad = isPrimary ? 2 : 5 - Math.min(cell.echoDepth, 4);
    const radius = isPrimary ? 6 : 3;

    // Glow effect for primary tiles
    if (isPrimary) {
      glow.fillStyle(color, 0.2);
      glow.fillRoundedRect(cx - CELL_SIZE / 2, cy - CELL_SIZE / 2, CELL_SIZE, CELL_SIZE, 8);
    }

    // Main cell fill
    g.fillStyle(color, isPrimary ? 1 : 0.75);
    g.fillRoundedRect(
      cx - CELL_SIZE / 2 + pad,
      cy - CELL_SIZE / 2 + pad,
      CELL_SIZE - pad * 2,
      CELL_SIZE - pad * 2,
      radius
    );

    // Resonance shimmer outline
    if (isResonance) {
      g.lineStyle(1.5, 0xffd700, 0.7);
      g.strokeRoundedRect(
        cx - CELL_SIZE / 2 + pad,
        cy - CELL_SIZE / 2 + pad,
        CELL_SIZE - pad * 2,
        CELL_SIZE - pad * 2,
        radius
      );
    }

    if (animate) {
      g.setAlpha(0);
      glow.setAlpha(0);
      this.tweens.add({
        targets: [g, glow],
        alpha: 1,
        duration: 300,
        ease: 'Cubic.easeOut',
        onComplete: () => this.animatingCells.delete(key),
      });

      if (isPrimary) {
        // Scale-in "pop" for primary tiles
        g.setScale(0.3);
        this.tweens.add({
          targets: g,
          scaleX: 1,
          scaleY: 1,
          duration: 400,
          ease: 'Back.easeOut',
        });
        // Emit wave particles
        this.emitWave(cx, cy, color);
      }
    }

    this.cellGraphics.set(key, g);
    this.glowGraphics.set(key, glow);
  }

  private emitWave(x: number, y: number, color: number) {
    // Expanding ring animation using a graphics object
    const ring = this.add.graphics();
    ring.lineStyle(3, color, 0.8);
    ring.strokeCircle(x, y, 5);

    this.tweens.add({
      targets: ring,
      scaleX: 8,
      scaleY: 8,
      alpha: 0,
      duration: 600,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    });

    // Particle burst
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      const dot = this.add.graphics();
      dot.fillStyle(color, 0.9);
      dot.fillCircle(x, y, 3);

      const dist = 30 + Math.random() * 40;
      this.tweens.add({
        targets: dot,
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist,
        alpha: 0,
        scaleX: 0,
        scaleY: 0,
        duration: 400 + Math.random() * 200,
        ease: 'Cubic.easeOut',
        onComplete: () => dot.destroy(),
      });
    }
  }

  private createAmbientParticles() {
    // Floating micro-dots in background
    for (let i = 0; i < 20; i++) {
      const dot = this.add.graphics();
      dot.fillStyle(0x3040a0, 0.3);
      dot.fillCircle(0, 0, 1.5);
      dot.x = Math.random() * CANVAS_W;
      dot.y = Math.random() * CANVAS_H;

      this.tweens.add({
        targets: dot,
        y: dot.y - 60 - Math.random() * 60,
        alpha: { from: 0, to: 0.4 },
        duration: 3000 + Math.random() * 4000,
        ease: 'Sine.easeInOut',
        yoyo: true,
        repeat: -1,
        delay: Math.random() * 5000,
      });
    }
  }

  /** Grid resolved — play celebration animation */
  playResolutionAnim() {
    // Flash all cells
    this.cellGraphics.forEach((g) => {
      this.tweens.add({
        targets: g,
        alpha: 0.3,
        duration: 200,
        yoyo: true,
        repeat: 3,
        ease: 'Sine.easeInOut',
      });
    });

    // Big central burst
    const cx = CANVAS_W / 2;
    const cy = CANVAS_H / 2;
    for (let i = 0; i < 40; i++) {
      const angle = (i / 40) * Math.PI * 2;
      const color = ECHO_COLORS[i % ECHO_COLORS.length];
      const dot = this.add.graphics();
      dot.fillStyle(colorIdToHex(color.id as ColorId), 0.9);
      dot.fillCircle(cx, cy, 4);

      const dist = 60 + Math.random() * 120;
      this.tweens.add({
        targets: dot,
        x: cx + Math.cos(angle) * dist,
        y: cy + Math.sin(angle) * dist,
        alpha: 0,
        duration: 1000 + Math.random() * 500,
        ease: 'Cubic.easeOut',
        onComplete: () => dot.destroy(),
      });
    }
  }

  update() {
    // Nothing per-frame needed — event driven
  }

  static getDimensions() {
    return { width: CANVAS_W, height: CANVAS_H };
  }
}
