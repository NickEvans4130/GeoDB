import React, { useEffect, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area, LineChart, Line,
  CartesianGrid, ReferenceLine, Legend,
} from 'recharts'
import { api, Overview, Bucket, CountryStat, DivisionStat, ClubStat, GraphNode } from '../api'
import { DivisionBadge } from '../components/DivisionBadge'
import { Skeleton } from '../components/Skeleton'

const DIV_COLORS: Record<number, string> = {
  10: '#4b5563', 20: '#cd7f32', 30: '#94a3b8', 40: '#fbbf24', 50: '#6366f1',
}
const DIV_NAMES: Record<number, string> = {
  10: 'Unranked', 20: 'Bronze', 30: 'Silver', 40: 'Gold', 50: 'Champion',
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
      padding: '16px 20px', flex: 1,
    }}>
      <div style={{ fontSize: 10, color: 'var(--text-secondary)', letterSpacing: '0.1em', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: '#e8e8f0' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
      padding: '20px 24px',
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', color: 'var(--text-secondary)', marginBottom: 16 }}>
        {title}
      </div>
      {children}
    </div>
  )
}

const darkTooltipStyle = {
  contentStyle: {
    background: 'rgba(10,10,16,0.95)', border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 6, fontFamily: 'JetBrains Mono', fontSize: 11, color: '#e8e8f0',
  },
  labelStyle: { color: '#6b7280' },
  cursor: { fill: 'rgba(255,255,255,0.04)' },
}

export default function Stats() {
  const [overview, setOverview] = useState<Overview | null>(null)
  const [ratingDist, setRatingDist] = useState<Bucket[]>([])
  const [divisions, setDivisions] = useState<DivisionStat[]>([])
  const [countries, setCountries] = useState<CountryStat[]>([])
  const [clubs, setClubs] = useState<ClubStat[]>([])
  const [leaderboard, setLeaderboard] = useState<GraphNode[]>([])
  const [lbPage, setLbPage] = useState(0)
  const [progress, setProgress] = useState<{ timestamp: string; total: number }[]>([])
  const [countryMetric, setCountryMetric] = useState<'player_count' | 'avg_rating'>('player_count')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.stats.overview(),
      api.stats.ratingDist(),
      api.stats.divisions(),
      api.stats.countries(),
      api.stats.clubs(),
      api.stats.crawlProgress(),
    ]).then(([ov, rd, div, co, cl, pr]) => {
      setOverview(ov)
      setRatingDist(rd)
      setDivisions(div)
      setCountries(co)
      setClubs(cl)
      setProgress(pr)
    }).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    api.stats.leaderboard(lbPage).then(setLeaderboard)
  }, [lbPage])

  const totalRanked = divisions.filter(d => d.division_type !== 10).reduce((a, d) => a + d.count, 0)

  return (
    <div style={{
      height: 'calc(100vh - 48px)', overflowY: 'auto', background: 'var(--bg)',
      padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: 20,
    }}>
      {/* Overview cards */}
      <div style={{ display: 'flex', gap: 16 }}>
        {loading ? (
          [1,2,3,4].map(i => <Skeleton key={i} height={100} style={{ flex: 1, borderRadius: 8 }} />)
        ) : overview ? (
          <>
            <StatCard label="TOTAL PLAYERS" value={overview.total_players.toLocaleString()} />
            <StatCard label="TOTAL CONNECTIONS" value={overview.total_edges.toLocaleString()} />
            <StatCard label="COUNTRIES" value={overview.total_countries} />
            <StatCard label="PRO USERS" value={`${overview.pct_pro}%`} sub={`avg rating ${overview.avg_rating}`} />
          </>
        ) : null}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Rating Distribution */}
        <Panel title="RATING DISTRIBUTION">
          {loading ? <Skeleton height={200} /> : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={ratingDist} barCategoryGap="20%">
                <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 10, fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip {...darkTooltipStyle} formatter={(v: number) => [v.toLocaleString(), 'Players']} />
                <Bar dataKey="count" radius={[3,3,0,0]}>
                  {ratingDist.map((entry, i) => (
                    <Cell key={i} fill={DIV_COLORS[entry.division_type || 10]} />
                  ))}
                </Bar>
                {[450, 675, 850, 1100, 1500].map(v => (
                  <ReferenceLine key={v} x={v} stroke="rgba(255,255,255,0.1)" strokeDasharray="3 3" />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </Panel>

        {/* Division Breakdown */}
        <Panel title="DIVISION BREAKDOWN">
          {loading ? <Skeleton height={200} /> : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
              <ResponsiveContainer width={160} height={160}>
                <PieChart>
                  <Pie data={divisions} dataKey="count" cx="50%" cy="50%" innerRadius={45} outerRadius={72}>
                    {divisions.map((d, i) => (
                      <Cell key={i} fill={DIV_COLORS[d.division_type]} />
                    ))}
                  </Pie>
                  <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle"
                    fill="#e8e8f0" fontSize={11} fontFamily="JetBrains Mono" fontWeight={700}>
                    {totalRanked.toLocaleString()}
                  </text>
                  <text x="50%" y="62%" textAnchor="middle" dominantBaseline="middle"
                    fill="#6b7280" fontSize={9} fontFamily="JetBrains Mono">
                    RANKED
                  </text>
                </PieChart>
              </ResponsiveContainer>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {divisions.map(d => (
                  <div key={d.division_type} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11 }}>
                    <DivisionBadge type={d.division_type} small />
                    <span style={{ color: 'var(--text-secondary)' }}>{d.count.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Panel>

        {/* Top Countries */}
        <Panel title="TOP COUNTRIES">
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            {(['player_count', 'avg_rating'] as const).map(m => (
              <button key={m} onClick={() => setCountryMetric(m)} style={{
                padding: '3px 10px', borderRadius: 4, fontSize: 10, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '0.06em',
                background: countryMetric === m ? 'rgba(99,102,241,0.2)' : 'var(--surface)',
                border: `1px solid ${countryMetric === m ? 'rgba(99,102,241,0.5)' : 'var(--border)'}`,
                color: countryMetric === m ? '#818cf8' : 'var(--text-secondary)',
              }}>
                {m === 'player_count' ? 'PLAYER COUNT' : 'AVG RATING'}
              </button>
            ))}
          </div>
          {loading ? <Skeleton height={220} /> : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={countries.slice(0, 15)} layout="vertical" barCategoryGap="15%">
                <XAxis type="number" tick={{ fill: '#6b7280', fontSize: 9, fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="country_code" width={30} tick={{ fill: '#9ca3af', fontSize: 10, fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} />
                <Tooltip {...darkTooltipStyle} />
                <Bar dataKey={countryMetric} fill="#6366f1" radius={[0,3,3,0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Panel>

        {/* Crawl Progress */}
        <Panel title="CRAWL PROGRESS">
          {loading ? <Skeleton height={220} /> : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={progress}>
                <defs>
                  <linearGradient id="cpg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity="0.4" />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <XAxis dataKey="timestamp" hide />
                <YAxis tick={{ fill: '#6b7280', fontSize: 9, fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} width={50} />
                <Tooltip {...darkTooltipStyle} formatter={(v: number) => [v.toLocaleString(), 'Total Nodes']} />
                <Area type="monotone" dataKey="total" stroke="#6366f1" fill="url(#cpg)" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Panel>
      </div>

      {/* Top Clubs */}
      <Panel title="TOP CLUBS">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ color: 'var(--text-secondary)', fontSize: 10, letterSpacing: '0.1em' }}>
                {['CLUB', 'MEMBERS', 'AVG RATING', 'AVG ELO', 'AVG LEVEL'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '6px 12px', fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {clubs.slice(0, 20).map((c, i) => (
                <tr key={c.club_id} style={{ borderTop: '1px solid var(--border)', transition: 'background 200ms' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-hover)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <td style={{ padding: '8px 12px', color: '#818cf8', fontWeight: 600 }}>[{c.club_tag}]</td>
                  <td style={{ padding: '8px 12px' }}>{c.member_count}</td>
                  <td style={{ padding: '8px 12px' }}>{Math.round(c.avg_rating || 0)}</td>
                  <td style={{ padding: '8px 12px' }}>{Math.round(c.avg_elo || 0)}</td>
                  <td style={{ padding: '8px 12px' }}>{Math.round(c.avg_level || 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* Leaderboard */}
      <Panel title="LEADERBOARD">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ color: 'var(--text-secondary)', fontSize: 10, letterSpacing: '0.1em' }}>
                {['#', 'PLAYER', 'COUNTRY', 'RATING', 'ELO', 'DIVISION', 'LEVEL', 'TYPE'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '6px 12px', fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((p, i) => (
                <tr key={p.id}
                  style={{
                    borderTop: '1px solid var(--border)', transition: 'background 200ms',
                    borderLeft: p.division_type === 50 ? '2px solid #6366f1' : '2px solid transparent',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-hover)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <td style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>{lbPage * 25 + i + 1}</td>
                  <td style={{ padding: '8px 12px', fontWeight: 600 }}>{p.nick}</td>
                  <td style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>{p.country_code?.toUpperCase()}</td>
                  <td style={{ padding: '8px 12px', color: '#fbbf24', fontWeight: 700 }}>{p.rating}</td>
                  <td style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>{p.elo}</td>
                  <td style={{ padding: '8px 12px' }}><DivisionBadge type={p.division_type} small /></td>
                  <td style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>{p.level}</td>
                  <td style={{ padding: '8px 12px', color: 'var(--text-muted)', fontSize: 10 }}>{p.subscription_type}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
          <button disabled={lbPage === 0} onClick={() => setLbPage(p => p - 1)}
            style={{ padding: '6px 16px', borderRadius: 4, background: 'var(--surface)', border: '1px solid var(--border)',
              color: lbPage === 0 ? 'var(--text-muted)' : 'var(--text-primary)', cursor: lbPage === 0 ? 'default' : 'pointer',
              fontFamily: 'inherit', fontSize: 11 }}>
            ← PREV
          </button>
          <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>PAGE {lbPage + 1}</span>
          <button disabled={leaderboard.length < 25} onClick={() => setLbPage(p => p + 1)}
            style={{ padding: '6px 16px', borderRadius: 4, background: 'var(--surface)', border: '1px solid var(--border)',
              color: leaderboard.length < 25 ? 'var(--text-muted)' : 'var(--text-primary)',
              cursor: leaderboard.length < 25 ? 'default' : 'pointer', fontFamily: 'inherit', fontSize: 11 }}>
            NEXT →
          </button>
        </div>
      </Panel>
    </div>
  )
}
