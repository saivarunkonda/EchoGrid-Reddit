import React, { useEffect, useRef, useState, useCallback } from 'react';
import Phaser from 'phaser';
import { GridScene } from './scenes/GridScene';
import { HUD } from './ui/HUD';
import type {
  InitResponse,
  PlaceTileResponse,
  RealtimeEvent,
  GridState,
} from '../shared/api';
import type { ColorId } from '../shared/api';
import { ECHO_COLORS } from '../shared/api';
import { connectRealtime } from '@devvit/web/client';
import './styles.css';

export default function App() {
  const phaserRef = useRef<Phaser.Game | null>(null);
  const sceneRef = useRef<GridScene | null>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);

  const [init, setInit] = useState<InitResponse | null>(null);
  const [grid, setGrid] = useState<GridState | null>(null);
  const [selectedColor, setSelectedColor] = useState<ColorId>(0);
  const [canPlace, setCanPlace] = useState(false);
  const [rateLimitSecs, setRateLimitSecs] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastMsg, setLastMsg] = useState<string>('');
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [resolved, setResolved] = useState(false);

  // ─────────────────────────────────────────
  // Fetch initial state
  // ─────────────────────────────────────────
  useEffect(() => {
    fetch('/api/init')
      .then((r) => r.json())
      .then((data: InitResponse) => {
        setInit(data);
        setGrid(data.grid);
        setResolved(data.grid.resolved);
        const canP = data.rateLimitRemaining === 0 && !data.grid.resolved;
        setCanPlace(canP);
        setRateLimitSecs(data.rateLimitRemaining);
        setLoading(false);
      })
      .catch((e) => {
        setError('Failed to load game. Please refresh.');
        setLoading(false);
      });
  }, []);

  // ─────────────────────────────────────────
  // Countdown timer for rate limit
  // ─────────────────────────────────────────
  useEffect(() => {
    if (rateLimitSecs <= 0) return;
    const t = setInterval(() => {
      setRateLimitSecs((s) => {
        if (s <= 1) {
          clearInterval(t);
          setCanPlace(!resolved);
          sceneRef.current?.setCanPlace(!resolved);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [rateLimitSecs, resolved]);

  // ─────────────────────────────────────────
  // Init Phaser once we have init data
  // ─────────────────────────────────────────
  useEffect(() => {
    if (!init || !canvasContainerRef.current || phaserRef.current) return;

    const { width, height } = GridScene.getDimensions();

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      width,
      height,
      backgroundColor: '#0a0a1a',
      parent: canvasContainerRef.current,
      scene: [GridScene],
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      input: { touch: true },
    });

    game.events.once('ready', () => {
      const scene = game.scene.getScene('GridScene') as GridScene;
      sceneRef.current = scene;

      scene.scene.start('GridScene', {
        username: init.username,
        events: {
          onTilePlaced: handleTilePlaced,
          onCoverageUpdate: (cov: number) => {
            setGrid((g) => g ? { ...g, coverage: cov } : g);
          },
          onGridResolved: () => {
            setResolved(true);
            setCanPlace(false);
            scene.playResolutionAnim();
          },
        },
      });

      // Load existing grid
      setTimeout(() => {
        scene.applyGridState(init.grid.cells, false);
      }, 100);
    });

    phaserRef.current = game;

    return () => {
      game.destroy(true);
      phaserRef.current = null;
      sceneRef.current = null;
    };
  }, [init]);

  // ─────────────────────────────────────────
  // Realtime subscription
  // ─────────────────────────────────────────
  useEffect(() => {
    const unsub = connectRealtime('echogrid', (msg: string) => {
      try {
        const event: RealtimeEvent = JSON.parse(msg);
        handleRealtimeEvent(event);
      } catch {}
    });
    return () => unsub();
  }, []);

  const handleRealtimeEvent = useCallback((event: RealtimeEvent) => {
    if (event.type === 'tile_placed') {
      sceneRef.current?.applyRealtimeUpdate(event.affectedCells);
      setGrid((g) => g ? { ...g, coverage: event.coverage, cells: { ...g.cells, ...event.affectedCells } } : g);
      setLastMsg(`u/${event.placedBy} placed a tile!`);
    } else if (event.type === 'grid_resolved') {
      setResolved(true);
      setCanPlace(false);
      sceneRef.current?.playResolutionAnim();
      setLastMsg(`🎉 Grid complete! Community wins!`);
    }
  }, []);

  // ─────────────────────────────────────────
  // Place tile handler
  // ─────────────────────────────────────────
  const handleTilePlaced = useCallback(async (row: number, col: number, colorId: ColorId) => {
    setCanPlace(false);
    sceneRef.current?.setCanPlace(false);

    // Optimistic update
    sceneRef.current?.applyOptimistic(row, col, colorId);

    try {
      const res = await fetch('/api/place-tile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ row, col, colorId }),
      });
      const data: PlaceTileResponse = await res.json();

      if (data.type === 'placed') {
        // Apply authoritative state
        sceneRef.current?.applyRealtimeUpdate(data.affectedCells);
        setGrid((g) => g ? { ...g, coverage: data.coverage, cells: { ...g.cells, ...data.affectedCells } } : g);

        if (data.resolved) {
          setResolved(true);
          sceneRef.current?.playResolutionAnim();
        }

        if (data.streakUpdated) {
          setLastMsg(`🔥 Streak extended! +${data.xpGained} XP`);
        } else {
          setLastMsg(`+${data.xpGained} XP`);
        }

        // Start rate limit countdown
        setRateLimitSecs(60);

      } else if (data.type === 'error') {
        // Rollback optimistic update (reload from server)
        fetch('/api/init').then(r => r.json()).then((d: InitResponse) => {
          sceneRef.current?.applyGridState(d.grid.cells, false);
          setGrid(d.grid);
        });

        if (data.reason === 'rate_limit') {
          setRateLimitSecs(data.retryAfter ?? 60);
        } else if (data.reason === 'cell_occupied') {
          setLastMsg('Cell already taken!');
          setCanPlace(true);
          sceneRef.current?.setCanPlace(true);
        }
      }
    } catch (e) {
      setCanPlace(true);
      sceneRef.current?.setCanPlace(true);
      setLastMsg('Error placing tile. Try again.');
    }
  }, [resolved]);

  // ─────────────────────────────────────────
  // Color change
  // ─────────────────────────────────────────
  const handleColorChange = useCallback((colorId: ColorId) => {
    setSelectedColor(colorId);
    sceneRef.current?.setColor(colorId);
  }, []);

  // ─────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────
  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-logo">EchoGrid</div>
        <div className="loading-wave">
          {[0,1,2,3,4].map(i => (
            <span key={i} className="wave-dot" style={{ animationDelay: `${i * 0.12}s` }} />
          ))}
        </div>
        <p className="loading-text">Loading today's grid…</p>
      </div>
    );
  }

  if (error) {
    return <div className="error-screen">{error}</div>;
  }

  return (
    <div className="app-container">
      <HUD
        username={init?.username ?? ''}
        streak={init?.userStreak ?? 0}
        xp={init?.userXP ?? 0}
        rank={init?.userRank ?? 'Static'}
        coverage={grid?.coverage ?? 0}
        resolved={resolved}
        canPlace={canPlace}
        rateLimitSecs={rateLimitSecs}
        selectedColor={selectedColor}
        onColorChange={handleColorChange}
        onToggleLeaderboard={() => setShowLeaderboard(s => !s)}
        leaderboard={init?.leaderboard ?? []}
        showLeaderboard={showLeaderboard}
        lastMsg={lastMsg}
        totalPlacements={grid?.totalPlacements ?? 0}
        date={grid?.date ?? ''}
      />

      <div className="canvas-wrapper" ref={canvasContainerRef} />

      {resolved && (
        <div className="resolved-banner">
          <div className="resolved-title">⚡ Grid Resonated!</div>
          <div className="resolved-sub">The community did it. Come back tomorrow for a new challenge.</div>
        </div>
      )}
    </div>
  );
}
