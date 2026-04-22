import React, { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { api, GraphNode, EloPoint } from '../api'
import { DivisionBadge } from '../components/DivisionBadge'
import { Skeleton } from '../components/Skeleton'

const DIVISION_NAMES: Record<number, string> = {
  10: 'Unranked', 20: 'Bronze', 30: 'Silver', 40: 'Gold', 50: 'Champion',
}

function StatCard({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 8, padding: '12px 16px',
    }}>
      <div style={{ fontSize: 9, color: 'var(--text-secondary)', letterSpacing: '0.12em', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: '#e8e8f0', lineHeight: 1 }}>{value ?? '—'}</div>
      {sub && <div style={{ marginTop: 4, fontSize: 11, color: 'var(--text-secondary)' }}>{sub}</div>}
    </div>
  )
}

function EloChart({ data }: { data: EloPoint[] }) {
  if (!data.length) return (
    <div style={{ color: 'var(--text-muted)', fontSize: 12, padding: '24px 0', textAlign: 'center' }}>
      No history recorded yet — will appear after next re-crawl
    </div>
  )
  const chartData = [...data].reverse().map(d => ({
    date: new Date(d.recorded_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    elo: d.elo,
    rating: d.rating,
  }))
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
        <XAxis dataKey="date" tick={{ fill: 'var(--text-secondary)', fontSize: 10 }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fill: 'var(--text-secondary)', fontSize: 10 }} tickLine={false} axisLine={false} width={48} />
        <Tooltip
          contentStyle={{ background: '#0d0d14', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12 }}
          labelStyle={{ color: '#e8e8f0' }}
        />
        <Legend wrapperStyle={{ fontSize: 11, color: 'var(--text-secondary)' }} />
        <Line type="monotone" dataKey="rating" stroke="#fbbf24" strokeWidth={2} dot={false} name="Rating" />
        <Line type="monotone" dataKey="elo" stroke="#6366f1" strokeWidth={2} dot={false} name="ELO" />
      </LineChart>
    </ResponsiveContainer>
  )
}

export default function Player() {
  const { id } = useParams<{ id: string }>()
  const [data, setData] = useState<{ player: GraphNode; friends: GraphNode[] } | null>(null)
  const [eloHistory, setEloHistory] = useState<EloPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    setNotFound(false)
    Promise.all([
      api.graph.node(id),
      api.stats.eloHistory(id),
    ]).then(([nd, elo]) => {
      setData(nd)
      setEloHistory(elo)
    }).catch(() => setNotFound(true))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return (
    <div style={{ maxWidth: 900, margin: '32px auto', padding: '0 24px' }}>
      <Skeleton height={32} width={200} />
      <div style={{ marginTop: 24, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        {[...Array(8)].map((_, i) => <Skeleton key={i} height={72} />)}
      </div>
    </div>
  )

  if (notFound) return (
    <div style={{ maxWidth: 900, margin: '64px auto', padding: '0 24px', textAlign: 'center' }}>
      <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>Player not found in database.</div>
      <Link to="/" style={{ marginTop: 16, display: 'inline-block', fontSize: 11, color: '#818cf8' }}>← Back to graph</Link>
    </div>
  )

  const p = data!.player
  const ratingChange = p.last_rating_change ?? 0
  const memberSince = p.created_at
    ? new Date(p.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    : null
  const lastSeen = (p as any).last_seen
    ? new Date((p as any).last_seen).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 24px' }}>
      {/* Back link */}
      <Link to="/" style={{ fontSize: 11, color: 'var(--text-secondary)', textDecoration: 'none', letterSpacing: '0.08em' }}>
        ← GRAPH
      </Link>

      {/* Header */}
      <div style={{ marginTop: 16, display: 'flex', alignItems: 'flex-start', gap: 20, flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h1 style={{ fontSize: 28, fontWeight: 700, color: '#e8e8f0', margin: 0 }}>
              {p.nick}
            </h1>
            {p.is_verified && (
              <span style={{ fontSize: 12, color: '#10b981', fontWeight: 600 }}>VERIFIED</span>
            )}
            {p.is_banned && (
              <span style={{ fontSize: 12, color: '#ef4444', fontWeight: 600 }}>BANNED</span>
            )}
          </div>
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
            <DivisionBadge type={p.division_type} />
            {p.country_code && (
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{p.country_code.toUpperCase()}</span>
            )}
            {p.club_tag && (
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>[{p.club_tag}]</span>
            )}
          </div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <a
            href={`https://www.geoguessr.com/user/${id}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              padding: '7px 14px', borderRadius: 6, fontSize: 11, fontWeight: 700,
              letterSpacing: '0.08em', textDecoration: 'none',
              background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)',
              color: '#818cf8',
            }}
          >
            GEOGUESSR ↗
          </a>
        </div>
      </div>

      {/* Stats grid */}
      <div style={{ marginTop: 24, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
        <StatCard
          label="RATING"
          value={p.rating?.toLocaleString() ?? '—'}
          sub={ratingChange !== 0
            ? <span style={{ color: ratingChange > 0 ? '#10b981' : '#ef4444' }}>
                {ratingChange > 0 ? '▲' : '▼'} {Math.abs(ratingChange)}
              </span>
            : null}
        />
        <StatCard label="ELO" value={p.elo?.toLocaleString() ?? '—'} />
        <StatCard label="LEVEL" value={p.level} sub={p.xp ? `${p.xp.toLocaleString()} XP` : undefined} />
        <StatCard label="DIVISION" value={DIVISION_NAMES[p.division_type] ?? '—'} />
        {memberSince && <StatCard label="MEMBER SINCE" value={memberSince} />}
        {lastSeen && <StatCard label="LAST UPDATED" value={lastSeen} />}
        {p.subscription_type && <StatCard label="SUBSCRIPTION" value={p.subscription_type} />}
        {p.is_pro && <StatCard label="PRO" value="Yes" />}
      </div>

      {/* Medals */}
      {(p.gold_medals > 0 || p.silver_medals > 0 || p.bronze_medals > 0 || p.platinum_medals > 0) && (
        <div style={{ marginTop: 16, display: 'flex', gap: 16 }}>
          {p.platinum_medals > 0 && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 16px', textAlign: 'center' }}>
              <div style={{ fontSize: 20 }}>💎</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#e8e8f0' }}>{p.platinum_medals}</div>
              <div style={{ fontSize: 9, color: 'var(--text-secondary)', letterSpacing: '0.08em' }}>PLATINUM</div>
            </div>
          )}
          {p.gold_medals > 0 && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 16px', textAlign: 'center' }}>
              <div style={{ fontSize: 20 }}>🥇</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#e8e8f0' }}>{p.gold_medals}</div>
              <div style={{ fontSize: 9, color: 'var(--text-secondary)', letterSpacing: '0.08em' }}>GOLD</div>
            </div>
          )}
          {p.silver_medals > 0 && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 16px', textAlign: 'center' }}>
              <div style={{ fontSize: 20 }}>🥈</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#e8e8f0' }}>{p.silver_medals}</div>
              <div style={{ fontSize: 9, color: 'var(--text-secondary)', letterSpacing: '0.08em' }}>SILVER</div>
            </div>
          )}
          {p.bronze_medals > 0 && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 16px', textAlign: 'center' }}>
              <div style={{ fontSize: 20 }}>🥉</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#e8e8f0' }}>{p.bronze_medals}</div>
              <div style={{ fontSize: 9, color: 'var(--text-secondary)', letterSpacing: '0.08em' }}>BRONZE</div>
            </div>
          )}
        </div>
      )}

      {/* ELO / Rating history chart */}
      <div style={{ marginTop: 32, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', color: 'var(--text-secondary)', marginBottom: 16 }}>
          RATING &amp; ELO HISTORY
        </div>
        <EloChart data={eloHistory} />
      </div>

      {/* Friends */}
      {data!.friends.length > 0 && (
        <div style={{ marginTop: 32 }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', color: 'var(--text-secondary)', marginBottom: 12 }}>
            CONNECTIONS ({data!.friends.length})
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
            {data!.friends.map(f => (
              <Link
                key={f.id}
                to={`/player/${f.id}`}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 14px', borderRadius: 8, textDecoration: 'none',
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  transition: 'border-color 200ms ease-out',
                }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(99,102,241,0.5)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#e8e8f0' }}>{f.nick}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 2 }}>
                    {DIVISION_NAMES[f.division_type] ?? 'Unranked'}
                  </div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)' }}>
                  {f.rating?.toLocaleString() ?? '—'}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
