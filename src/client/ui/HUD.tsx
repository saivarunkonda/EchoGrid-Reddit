import React from 'react';
import type { ColorId, LeaderboardEntry } from '../../shared/api';
import { ECHO_COLORS, RANKS } from '../../shared/api';
import { hslToHex } from '../utils/gridMath';
import { ShapeVote } from './ShapeVote';

interface HUDProps {
  username: string;
  streak: number;
  xp: number;
  rank: string;
  coverage: number;
  resolved: boolean;
  canPlace: boolean;
  rateLimitSecs: number;
  selectedColor: ColorId;
  onColorChange: (id: ColorId) => void;
  onToggleLeaderboard: () => void;
  leaderboard: LeaderboardEntry[];
  showLeaderboard: boolean;
  lastMsg: string;
  totalPlacements: number;
  date: string;
  onVoteShape?: (shapeId: string) => void;
  shapeVotes?: Record<string, number>;
}

export function HUD(props: HUDProps) {
  const {
    username, streak, xp, rank, coverage, resolved, canPlace,
    rateLimitSecs, selectedColor, onColorChange, onToggleLeaderboard,
    leaderboard, showLeaderboard, lastMsg, totalPlacements, date,
    onVoteShape, shapeVotes,
  } = props;

  const coveragePct = Math.round(coverage * 100);
  const [showShapeVote, setShowShapeVote] = React.useState(false);

  return (
    <div className="hud">
      {/* Top bar */}
      <div className="hud-top">
        <div className="hud-logo">
          <span className="logo-echo">Echo</span><span className="logo-grid">Grid</span>
        </div>
        <div className="hud-date">{date ? `Day ${date}` : ''}</div>
        <div className="hud-actions">
          {onVoteShape && (
            <button className="hud-btn" onClick={() => setShowShapeVote(s => !s)} title="Vote for tomorrow's shape">
              🗳️
            </button>
          )}
          <button className="hud-btn" onClick={onToggleLeaderboard} title="Leaderboard">
            🏆
          </button>
        </div>
      </div>

      {/* Coverage bar */}
      <div className="coverage-section">
        <div className="coverage-label">
          <span>Community Coverage</span>
          <span className="coverage-pct">{coveragePct}%</span>
        </div>
        <div className="coverage-bar-bg">
          <div
            className={`coverage-bar-fill ${resolved ? 'resolved' : ''}`}
            style={{ width: `${coveragePct}%` }}
          />
          <div className="coverage-bar-threshold" style={{ left: '80%' }} title="Win at 80%" />
        </div>
        <div className="coverage-meta">{totalPlacements} tiles placed today</div>
      </div>

      {/* Color picker */}
      <div className="color-picker-section">
        <div className="color-picker-label">Your Echo Color</div>
        <div className="color-picker-grid">
          {ECHO_COLORS.map((c) => (
            <button
              key={c.id}
              className={`color-chip ${selectedColor === c.id ? 'selected' : ''}`}
              style={{
                background: `hsl(${c.hue}, 85%, 55%)`,
                boxShadow: selectedColor === c.id
                  ? `0 0 12px 4px hsl(${c.hue}, 85%, 55%)`
                  : undefined,
              }}
              onClick={() => onColorChange(c.id as ColorId)}
              title={c.name}
            />
          ))}
        </div>
        <div className="color-name">{ECHO_COLORS[selectedColor].name}</div>
      </div>

      {/* Action state */}
      <div className={`action-state ${canPlace ? 'can-place' : 'waiting'}`}>
        {resolved ? (
          <span>✨ Grid Complete! Come back tomorrow.</span>
        ) : canPlace ? (
          <span>🎯 Tap a cell to place your echo</span>
        ) : (
          <span>⏳ Next tile in <strong>{rateLimitSecs}s</strong></span>
        )}
      </div>

      {/* Toast message */}
      {lastMsg && (
        <div className="toast-msg" key={lastMsg}>
          {lastMsg}
        </div>
      )}

      {/* Player stats */}
      <div className="player-stats">
        <div className="stat">
          <span className="stat-label">Player</span>
          <span className="stat-value">u/{username}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Rank</span>
          <span className="stat-value rank-badge">{rank}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Streak</span>
          <span className="stat-value">🔥 {streak} days</span>
        </div>
        <div className="stat">
          <span className="stat-label">XP</span>
          <span className="stat-value">{xp.toLocaleString()}</span>
        </div>
      </div>

      {/* Leaderboard panel */}
      {showLeaderboard && (
        <div className="leaderboard-panel">
          <div className="lb-header">
            <span>Today's Leaders</span>
            <button className="lb-close" onClick={onToggleLeaderboard}>✕</button>
          </div>
          {leaderboard.length === 0 ? (
            <div className="lb-empty">No tiles placed yet. Be first!</div>
          ) : (
            <ol className="lb-list">
              {leaderboard.map((entry, i) => (
                <li key={entry.username} className={`lb-entry ${i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : ''}`}>
                  <span className="lb-pos">{i + 1}</span>
                  <span className="lb-name">u/{entry.username}</span>
                  <span className="lb-rank">{entry.rank}</span>
                  <span className="lb-xp">{entry.xp} XP</span>
                  <span className="lb-streak">🔥{entry.streak}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      {/* Shape vote panel */}
      {showShapeVote && onVoteShape && (
        <div className="shape-vote-panel">
          <div className="shape-vote-header">
            <span>Vote for Tomorrow's Shape</span>
            <button className="lb-close" onClick={() => setShowShapeVote(false)}>✕</button>
          </div>
          <ShapeVote onVote={onVoteShape} currentVotes={shapeVotes} />
        </div>
      )}
    </div>
  );
}
