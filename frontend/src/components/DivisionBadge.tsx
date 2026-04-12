import React from 'react'

const DIVISIONS: Record<number, { label: string; color: string; bg: string; icon: string }> = {
  10: { label: 'Unranked', color: '#9ca3af', bg: 'rgba(75,85,99,0.3)', icon: '☆' },
  20: { label: 'Bronze',   color: '#cd7f32', bg: 'rgba(205,127,50,0.2)', icon: '◆' },
  30: { label: 'Silver',   color: '#94a3b8', bg: 'rgba(148,163,184,0.2)', icon: '◆' },
  40: { label: 'Gold',     color: '#fbbf24', bg: 'rgba(251,191,36,0.2)', icon: '◆' },
  50: { label: 'Champion', color: '#6366f1', bg: 'rgba(99,102,241,0.2)', icon: '♛' },
}

export function DivisionBadge({ type, small }: { type: number; small?: boolean }) {
  const d = DIVISIONS[type] || DIVISIONS[10]
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: small ? '1px 6px' : '2px 8px',
      borderRadius: 4,
      fontSize: small ? 10 : 11,
      fontWeight: 600,
      color: d.color,
      background: d.bg,
      border: `1px solid ${d.color}33`,
      boxShadow: type === 50 ? `0 0 8px ${d.color}40` : 'none',
      letterSpacing: '0.05em',
      whiteSpace: 'nowrap',
    }}>
      <span>{d.icon}</span>
      {d.label}
    </span>
  )
}

export function divisionColor(type: number): string {
  return (DIVISIONS[type] || DIVISIONS[10]).color
}
