import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, GraphNode, EloPoint } from '../api'
import { DivisionBadge } from './DivisionBadge'
import { Skeleton } from './Skeleton'

interface NodeSidebarProps {
  nodeId: string | null
  onClose: () => void
  onExpandNetwork: (id: string) => void
}

function EloSparkline({ data }: { data: EloPoint[] }) {
  if (!data.length) return null
  const vals = data.map(d => d.rating).reverse()
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  const range = max - min || 1
  const w = 200, h = 60
  const pts = vals.map((v, i) => `${(i / (vals.length - 1)) * w},${h - ((v - min) / range) * (h - 4) - 2}`)
  return (
    <svg width={w} height={h} style={{ display: 'block' }}>
      <defs>
        <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6366f1" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline
        points={pts.join(' ')}
        fill="none"
        stroke="#6366f1"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function NodeSidebar({ nodeId, onClose, onExpandNetwork }: NodeSidebarProps) {
  const [data, setData] = useState<{ player: GraphNode; friends: GraphNode[] } | null>(null)
  const [eloHistory, setEloHistory] = useState<EloPoint[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!nodeId) { setData(null); return }
    setLoading(true)
    Promise.all([
      api.graph.node(nodeId),
      api.stats.eloHistory(nodeId),
    ]).then(([nd, elo]) => {
      setData(nd)
      setEloHistory(elo)
    }).finally(() => setLoading(false))
  }, [nodeId])

  if (!nodeId) return null

  const p = data?.player
  const ratingChange = p?.last_rating_change ?? 0

  const xpPct = (p && p.xp && p.level) ? Math.min(100, Math.round((p.xp / (p.level * 1000 + 1000)) * 100)) : 0

  const memberSince = p?.created_at
    ? new Date(p.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    : null

  return (
    <div style={{
      position: 'fixed', top: 48, right: 0, bottom: 32, width: 320,
      background: 'rgba(5,5,8,0.92)',
      borderLeft: '1px solid var(--border)',
      backdropFilter: 'blur(16px)',
      display: 'flex', flexDirection: 'column',
      animation: 'slideInRight 250ms ease-out',
      zIndex: 200,
      overflowY: 'auto',
    }}>
      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>

      {/* Header */}
      <div style={{ padding: '16px 16px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        {loading ? (
          <Skeleton width={140} height={24} />
        ) : (
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#e8e8f0', lineHeight: 1.2 }}>
              {p?.nick || 'Unknown'}
              {p?.is_verified && (
                <span style={{ marginLeft: 6, fontSize: 11, color: '#10b981', verticalAlign: 'middle' }}>✓</span>
              )}
            </div>
            {p && <div style={{ marginTop: 6 }}><DivisionBadge type={p.division_type} /></div>}
          </div>
        )}
        <button onClick={onClose} style={{
          background: 'none', border: 'none', color: 'var(--text-secondary)',
          cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 4,
        }}>×</button>
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Rating */}
        {loading ? <Skeleton height={48} /> : p && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8 }}>
            {[
              { label: 'RATING', value: p.rating, change: ratingChange },
            ].map(({ label, value, change }) => (
              <div key={label} style={{
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 6, padding: '8px 10px',
              }}>
                <div style={{ fontSize: 9, color: 'var(--text-secondary)', letterSpacing: '0.1em' }}>{label}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#e8e8f0' }}>{value ?? '—'}</div>
                {change !== null && change !== 0 && (
                  <div style={{ fontSize: 11, color: change > 0 ? '#10b981' : '#ef4444' }}>
                    {change > 0 ? '▲' : '▼'} {Math.abs(change)}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Divider */}
        <div style={{ height: 1, background: 'var(--border)' }} />

        {/* Level + XP */}
        {loading ? <Skeleton height={32} /> : p && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 11, color: 'var(--text-secondary)' }}>
              <span>LVL {p.level}</span>
              <span>{p.xp?.toLocaleString()} XP</span>
            </div>
            <div style={{ height: 4, borderRadius: 2, background: 'var(--border)', overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 2, width: `${xpPct}%`,
                background: 'linear-gradient(90deg, #fbbf24, #f59e0b)',
                transition: 'width 600ms ease-out',
              }} />
            </div>
          </div>
        )}

        {/* Medals */}
        {p && (p.gold_medals || p.silver_medals || p.bronze_medals || p.platinum_medals) ? (
          <div style={{ fontSize: 13, display: 'flex', gap: 12 }}>
            {p.gold_medals > 0 && <span>🥇 {p.gold_medals}</span>}
            {p.silver_medals > 0 && <span>🥈 {p.silver_medals}</span>}
            {p.bronze_medals > 0 && <span>🥉 {p.bronze_medals}</span>}
            {p.platinum_medals > 0 && <span>💎 {p.platinum_medals}</span>}
          </div>
        ) : null}

        {/* Club */}
        {p?.club_tag && (
          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
            Club: <span style={{ color: 'var(--text-primary)' }}>[{p.club_tag}]</span>
          </div>
        )}

        {/* Since */}
        {memberSince && (
          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
            Since <span style={{ color: 'var(--text-primary)' }}>{memberSince}</span>
          </div>
        )}

        {/* Rating Sparkline */}
        {eloHistory.length > 0 && (
          <div>
            <div style={{ fontSize: 9, color: 'var(--text-secondary)', letterSpacing: '0.1em', marginBottom: 6 }}>
              RATING HISTORY
            </div>
            <EloSparkline data={eloHistory} />
          </div>
        )}

        {/* Subscription badge */}
        {p?.subscription_type && (
          <div style={{ fontSize: 11 }}>
            <span style={{
              padding: '2px 8px', borderRadius: 4,
              background: 'rgba(99,102,241,0.15)', color: '#818cf8',
              border: '1px solid rgba(99,102,241,0.3)',
            }}>
              {p.subscription_type}
            </span>
          </div>
        )}

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          <button
            onClick={() => nodeId && onExpandNetwork(nodeId)}
            style={{
              flex: 1, padding: '8px 0', borderRadius: 6, fontSize: 10, fontWeight: 700,
              letterSpacing: '0.08em', cursor: 'pointer', fontFamily: 'inherit',
              background: 'var(--surface)', border: '1px solid var(--border)',
              color: 'var(--text-primary)', transition: 'all 200ms ease-out',
            }}
          >
            EXPAND NETWORK
          </button>
          <Link
            to={`/player/${nodeId}`}
            style={{
              flex: 1, padding: '8px 0', borderRadius: 6, fontSize: 10, fontWeight: 700,
              letterSpacing: '0.08em', textDecoration: 'none', textAlign: 'center',
              background: 'var(--surface)', border: '1px solid var(--border)',
              color: 'var(--text-primary)', transition: 'all 200ms ease-out',
            }}
          >
            VIEW PROFILE
          </Link>
        </div>
        <a
          href={`https://www.geoguessr.com/user/${nodeId}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'block', padding: '8px 0', borderRadius: 6, fontSize: 10, fontWeight: 700,
            letterSpacing: '0.08em', textDecoration: 'none', textAlign: 'center',
            background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)',
            color: '#818cf8', transition: 'all 200ms ease-out',
          }}
        >
          GEOGUESSR ↗
        </a>
      </div>
    </div>
  )
}
