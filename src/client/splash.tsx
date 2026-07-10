import React, { useEffect, useState } from 'react';
import { openPost } from '@devvit/web/client';
import { ECHO_COLORS } from '../shared/api';
import './styles.css';

// Splash view — shown inline in the Reddit feed (lightweight, no Phaser)
// Clicking opens the full expanded game view

const PREVIEW_COLORS = [
  '#e05555', '#e07840', '#e0c040', '#5ec050',
  '#40b8a8', '#4080d0', '#8060d0', '#c060a0',
  '#c06060', '#d09040', '#d0a830', '#70c060',
  '#30a898', '#5090e0', '#9070e0', '#d070b0',
  '#a04040', '#c07020', '#c09020', '#50a040',
  '#309080', '#3060b0', '#6050b0', '#b05090',
  '#804040', '#a06020', '#a07810', '#408030',
  '#207060', '#205090', '#504090', '#903070',
];

export default function Splash() {
  const [cells, setCells] = useState<{ color: string; delay: number }[]>([]);

  useEffect(() => {
    const generated = PREVIEW_COLORS.map((color, i) => ({
      color,
      delay: (i % 8) * 0.06 + Math.floor(i / 8) * 0.08,
    }));
    setCells(generated);
  }, []);

  return (
    <div className="splash-container" onClick={() => openPost('game')}>
      <div className="splash-logo-big">
        <span style={{ color: '#5c7aff', textShadow: '0 0 16px rgba(92,122,255,0.5)' }}>Echo</span>
        <span style={{ color: '#e8eaf6' }}>Grid</span>
      </div>

      <div className="splash-tagline">
        A daily community wave puzzle. Your echo ripples through everyone.
      </div>

      {/* Mini grid preview */}
      <div className="splash-grid-preview">
        {cells.map((cell, i) => (
          <div
            key={i}
            className="splash-cell"
            style={{
              background: cell.color,
              animationDelay: `${cell.delay}s`,
            }}
          />
        ))}
      </div>

      <button className="splash-play-btn" onClick={() => openPost('game')}>
        Place Your Echo →
      </button>
    </div>
  );
}
