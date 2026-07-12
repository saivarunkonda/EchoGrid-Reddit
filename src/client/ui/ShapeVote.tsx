import React, { useState, useEffect } from 'react';

interface ShapeVoteProps {
  onVote: (shapeId: string) => void;
  currentVotes?: Record<string, number>;
}

const SHAPES = [
  { id: 'standard', name: 'Standard', icon: '⬜' },
  { id: 'spiral', name: 'Spiral', icon: '🌀' },
  { id: 'cross', name: 'Cross', icon: '✚' },
  { id: 'diamond', name: 'Diamond', icon: '◆' },
  { id: 'blob', name: 'Blob', icon: '💧' },
];

export function ShapeVote({ onVote, currentVotes = {} }: ShapeVoteProps) {
  const [selectedShape, setSelectedShape] = useState<string | null>(null);
  const [votes, setVotes] = useState<Record<string, number>>(currentVotes);
  const [hasVoted, setHasVoted] = useState(false);

  useEffect(() => {
    setVotes(currentVotes);
  }, [currentVotes]);

  const handleVote = async (shapeId: string) => {
    if (hasVoted) return;
    
    setSelectedShape(shapeId);
    setHasVoted(true);
    onVote(shapeId);

    // Optimistic update
    setVotes((prev) => ({
      ...prev,
      [shapeId]: (prev[shapeId] || 0) + 1,
    }));
  };

  const totalVotes = Object.values(votes).reduce((sum, count) => sum + count, 0);

  return (
    <div className="shape-vote-panel">
      <div className="shape-vote-header">
        <span>Vote for Tomorrow's Shape</span>
      </div>
      
      <div className="shape-vote-grid">
        {SHAPES.map((shape) => {
          const voteCount = votes[shape.id] || 0;
          const percentage = totalVotes > 0 ? (voteCount / totalVotes) * 100 : 0;
          const isSelected = selectedShape === shape.id;

          return (
            <button
              key={shape.id}
              className={`shape-vote-card ${isSelected ? 'selected' : ''} ${hasVoted ? 'voted' : ''}`}
              onClick={() => handleVote(shape.id)}
              disabled={hasVoted}
            >
              <div className="shape-icon">{shape.icon}</div>
              <div className="shape-name">{shape.name}</div>
              <div className="shape-votes">
                <span className="vote-count">{voteCount}</span>
                <span className="vote-pct">({percentage.toFixed(0)}%)</span>
              </div>
              {isSelected && <div className="vote-check">✓</div>}
            </button>
          );
        })}
      </div>

      {hasVoted && (
        <div className="shape-vote-confirmed">
          ✓ Your vote has been recorded!
        </div>
      )}
    </div>
  );
}
