import React, { useCallback, useEffect, useRef, useState } from 'react'
import { api, AdminStatus, CrawlSession, DbStats } from '../api'
import { Skeleton } from '../components/Skeleton'

function useAuth() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('geodb_token'))
  const login = async (pw: string) => {
    const { token } = await api.admin.login(pw)
    localStorage.setItem('geodb_token', token)
    setToken(token)
  }
  const logout = () => {
    localStorage.removeItem('geodb_token')
    setToken(null)
  }
  return { token, login, logout }
}

function Toast({ msg, ok }: { msg: string; ok: boolean }) {
  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
      padding: '10px 18px', borderRadius: 6, fontSize: 12, fontWeight: 600,
      background: ok ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
      border: `1px solid ${ok ? 'rgba(16,185,129,0.4)' : 'rgba(239,68,68,0.4)'}`,
      color: ok ? '#10b981' : '#ef4444',
      backdropFilter: 'blur(8px)',
      animation: 'fadeInUp 200ms ease-out',
    }}>
      {msg}
    </div>
  )
}

function DangerAction({ label, onConfirm }: { label: string; onConfirm: () => Promise<void> }) {
  const [val, setVal] = useState('')
  const [loading, setLoading] = useState(false)
  const ready = val === 'CONFIRM'
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <input
        value={val}
        onChange={e => setVal(e.target.value)}
        placeholder='type "CONFIRM"'
        style={{
          background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.2)',
          borderRadius: 4, padding: '6px 10px', fontSize: 11, color: '#ef4444',
          fontFamily: 'inherit', outline: 'none', width: 140,
        }}
      />
      <button
        disabled={!ready || loading}
        onClick={async () => { setLoading(true); await onConfirm(); setLoading(false); setVal('') }}
        style={{
          padding: '6px 14px', borderRadius: 4, fontSize: 11, fontWeight: 700,
          cursor: ready ? 'pointer' : 'not-allowed', fontFamily: 'inherit', letterSpacing: '0.06em',
          background: ready ? 'rgba(239,68,68,0.2)' : 'rgba(239,68,68,0.05)',
          border: `1px solid ${ready ? 'rgba(239,68,68,0.5)' : 'rgba(239,68,68,0.15)'}`,
          color: ready ? '#ef4444' : 'rgba(239,68,68,0.3)',
          transition: 'all 200ms',
        }}
      >
        {loading ? '...' : label}
      </button>
    </div>
  )
}

function Panel({ title, children, accent }: { title: string; children: React.ReactNode; accent?: string }) {
  return (
    <div style={{
      background: 'var(--surface)', borderRadius: 8, padding: '20px 24px',
      border: accent ? `1px solid ${accent}` : '1px solid var(--border)',
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', color: accent || 'var(--text-secondary)', marginBottom: 16 }}>
        {title}
      </div>
      {children}
    </div>
  )
}

function LiveLog() {
  const [lines, setLines] = useState<string[]>([])
  const [filter, setFilter] = useState('')
  const [autoScroll, setAutoScroll] = useState(true)
  const [connected, setConnected] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    const connect = () => {
      const token = localStorage.getItem('geodb_token') ?? ''
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
      const ws = new WebSocket(`${proto}//${location.host}/api/ws/logs?token=${encodeURIComponent(token)}`)
      wsRef.current = ws
      ws.onopen = () => setConnected(true)
      ws.onclose = () => { setConnected(false); setTimeout(connect, 3000) }
      ws.onmessage = e => {
        setLines(prev => {
          const next = [...prev, e.data]
          return next.length > 500 ? next.slice(-500) : next
        })
      }
    }
    connect()
    return () => wsRef.current?.close()
  }, [])

  useEffect(() => {
    if (autoScroll && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [lines, autoScroll])

  const filtered = filter ? lines.filter(l => l.toLowerCase().includes(filter.toLowerCase())) : lines

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
        <div style={{
          width: 8, height: 8, borderRadius: '50%',
          background: connected ? '#10b981' : '#ef4444',
          boxShadow: connected ? '0 0 6px #10b981' : 'none',
        }} />
        <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{connected ? 'CONNECTED' : 'RECONNECTING...'}</span>
        <input
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="filter..."
          style={{
            marginLeft: 'auto', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)',
            borderRadius: 4, padding: '3px 8px', fontSize: 11, color: 'var(--text-primary)',
            fontFamily: 'inherit', outline: 'none', width: 160,
          }}
        />
        <label style={{ fontSize: 10, color: 'var(--text-secondary)', display: 'flex', gap: 4, cursor: 'pointer' }}>
          <input type="checkbox" checked={autoScroll} onChange={e => setAutoScroll(e.target.checked)} />
          AUTO-SCROLL
        </label>
      </div>
      <div
        ref={logRef}
        style={{
          height: 320, overflowY: 'auto', background: '#0a0a0a',
          borderRadius: 6, padding: '10px 12px', fontFamily: 'JetBrains Mono',
          fontSize: 11, lineHeight: 1.6, color: '#00ff41',
          border: '1px solid rgba(0,255,65,0.1)',
        }}
      >
        {filtered.length === 0 ? (
          <span style={{ color: 'rgba(0,255,65,0.3)' }}>// no log output yet</span>
        ) : filtered.map((line, i) => (
          <div key={i} style={{
            color: filter && line.toLowerCase().includes(filter.toLowerCase())
              ? '#fbbf24' : '#00ff41',
            opacity: 0.9,
          }}>
            {line}
          </div>
        ))}
      </div>
    </div>
  )
}

function LoginPage({ onLogin }: { onLogin: (pw: string) => Promise<void> }) {
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)
  const submit = async () => {
    setLoading(true); setErr('')
    try { await onLogin(pw) } catch { setErr('Invalid password') } finally { setLoading(false) }
  }
  return (
    <div style={{
      height: 'calc(100vh - 48px)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)',
    }}>
      <div style={{
        background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)',
        borderRadius: 12, padding: '48px 56px', backdropFilter: 'blur(16px)',
        display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center', minWidth: 360,
      }}>
        <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: '0.3em', color: 'rgba(255,255,255,0.4)' }}>GEODB</div>
        <div style={{ fontSize: 10, color: 'var(--text-secondary)', letterSpacing: '0.2em', marginBottom: 8 }}>ADMIN ACCESS</div>
        <input
          type="password"
          value={pw}
          onChange={e => setPw(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submit()}
          placeholder="password"
          autoFocus
          style={{
            background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6,
            padding: '10px 14px', fontSize: 13, color: 'var(--text-primary)',
            fontFamily: 'inherit', outline: 'none', width: '100%', textAlign: 'center',
          }}
        />
        {err && <div style={{ fontSize: 11, color: '#ef4444' }}>{err}</div>}
        <button onClick={submit} disabled={loading} style={{
          width: '100%', padding: '10px 0', borderRadius: 6, fontSize: 11, fontWeight: 700,
          letterSpacing: '0.15em', cursor: 'pointer', fontFamily: 'inherit',
          background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.4)',
          color: '#818cf8', transition: 'all 200ms',
        }}>
          {loading ? '...' : 'ENTER TO ACCESS'}
        </button>
      </div>
    </div>
  )
}

export default function Admin() {
  const { token, login, logout } = useAuth()
  const [status, setStatus] = useState<AdminStatus | null>(null)
  const [dbStats, setDbStats] = useState<DbStats | null>(null)
  const [sessions, setSessions] = useState<CrawlSession[]>([])
  const [config, setConfig] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const [confirmStop, setConfirmStop] = useState(false)

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3000)
  }

  const refresh = useCallback(async () => {
    if (!token) return
    try {
      const [s, db, sess, cfg] = await Promise.all([
        api.admin.status(),
        api.admin.dbStats(),
        api.admin.sessions(),
        api.admin.config(),
      ])
      setStatus(s)
      setDbStats(db)
      setSessions(sess)
      setConfig(cfg)
    } catch (e: any) {
      if (e.message?.includes('401')) logout()
    }
  }, [token])

  useEffect(() => { refresh() }, [refresh])
  useEffect(() => {
    const t = setInterval(refresh, 15000)
    return () => clearInterval(t)
  }, [refresh])

  const cookieAge = (() => {
    // We don't store cookie timestamp, just show neutral
    return 0
  })()

  if (!token) return <LoginPage onLogin={login} />

  const statusColor = status?.running
    ? (status.paused ? '#fbbf24' : '#10b981')
    : '#ef4444'
  const statusLabel = status?.running
    ? (status.paused ? 'PAUSED' : 'RUNNING')
    : 'STOPPED'

  const fmt = (n: number) => n.toLocaleString()
  const fmtBytes = (b: number) => b > 1e9 ? `${(b/1e9).toFixed(1)} GB` : b > 1e6 ? `${(b/1e6).toFixed(1)} MB` : `${(b/1e3).toFixed(0)} KB`

  return (
    <div style={{
      height: 'calc(100vh - 48px)', overflowY: 'auto', background: 'var(--bg)',
      padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: 20,
    }}>
      <style>{`@keyframes fadeInUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }`}</style>
      {toast && <Toast msg={toast.msg} ok={toast.ok} />}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 10, color: 'var(--text-secondary)', letterSpacing: '0.2em' }}>ADMIN PANEL</div>
        <button onClick={logout} style={{
          padding: '4px 12px', borderRadius: 4, fontSize: 10, cursor: 'pointer', fontFamily: 'inherit',
          background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)',
        }}>LOGOUT</button>
      </div>

      {/* Crawler Status */}
      <Panel title="CRAWLER STATUS">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div style={{
            width: 10, height: 10, borderRadius: '50%', background: statusColor,
            boxShadow: `0 0 8px ${statusColor}`,
            animation: status?.running && !status.paused ? 'pulse 2s infinite' : 'none',
          }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: statusColor }}>{statusLabel}</span>
          {status?.pid && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>PID {status.pid}</span>}
        </div>

        {/* Metrics */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
          {[
            ['QUEUE', status ? fmt(status.queue_pending) : '—'],
            ['SESSION NODES', status ? fmt(status.nodes_this_session) : '—'],
            ['SESSION EDGES', status ? fmt(status.edges_this_session) : '—'],
            ['TOTAL CRAWLED', status ? fmt(status.total_crawled) : '—'],
          ].map(([l, v]) => (
            <div key={l} style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 6, padding: '10px 12px', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 9, color: 'var(--text-secondary)', letterSpacing: '0.1em', marginBottom: 4 }}>{l}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#e8e8f0' }}>{v}</div>
            </div>
          ))}
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={async () => {
            const res = await api.admin.crawlerStart()
            showToast(res.ok ? 'Crawler started' : 'Failed to start crawler', res.ok)
            setTimeout(refresh, 2000)
          }}
            style={{ padding: '8px 18px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
              background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.4)', color: '#10b981', letterSpacing: '0.08em' }}>
            START
          </button>
          <button onClick={async () => { await api.admin.crawlerPause(); showToast('Crawler paused'); refresh() }}
            style={{ padding: '8px 18px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
              background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)', color: '#fbbf24', letterSpacing: '0.08em' }}>
            PAUSE
          </button>
          {!confirmStop ? (
            <button onClick={() => setConfirmStop(true)}
              style={{ padding: '8px 18px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', letterSpacing: '0.08em' }}>
              STOP
            </button>
          ) : (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ fontSize: 10, color: '#ef4444' }}>Confirm stop?</span>
              <button onClick={async () => { await api.admin.crawlerStop(); setConfirmStop(false); showToast('Crawler stopped'); refresh() }}
                style={{ padding: '6px 12px', borderRadius: 4, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
                  background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.5)', color: '#ef4444' }}>
                YES, STOP
              </button>
              <button onClick={() => setConfirmStop(false)}
                style={{ padding: '6px 12px', borderRadius: 4, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
                  background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                CANCEL
              </button>
            </div>
          )}
        </div>
      </Panel>

      {/* Live Log */}
      <Panel title="LIVE LOG STREAM">
        <LiveLog />
      </Panel>

      {/* Configuration */}
      <Panel title="CONFIGURATION">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 520 }}>
          {[
            { key: 'max_depth', label: 'Max Depth (0 = unlimited)', type: 'number' },
            { key: 'delay_min', label: 'Delay Min (s)', type: 'number' },
            { key: 'delay_max', label: 'Delay Max (s)', type: 'number' },
            { key: 'seed_user_id', label: 'Seed User ID', type: 'text' },
          ].map(({ key, label, type }) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <label style={{ fontSize: 11, color: 'var(--text-secondary)', width: 200, flexShrink: 0 }}>{label}</label>
              <input
                type={type}
                value={config[key] || ''}
                onChange={e => setConfig(c => ({ ...c, [key]: e.target.value }))}
                style={{
                  flex: 1, background: 'var(--surface)', border: '1px solid var(--border)',
                  borderRadius: 4, padding: '6px 10px', fontSize: 12, color: 'var(--text-primary)',
                  fontFamily: 'inherit', outline: 'none',
                }}
              />
            </div>
          ))}

          {/* Cookie textarea */}
          <div>
            <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
              Session Cookie ({config.cookie?.length || 0} chars)
            </label>
            <textarea
              value={config.cookie || ''}
              onChange={e => setConfig(c => ({ ...c, cookie: e.target.value }))}
              rows={4}
              style={{
                width: '100%', background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 4, padding: '8px 10px', fontSize: 11, color: 'var(--text-primary)',
                fontFamily: 'inherit', outline: 'none', resize: 'vertical',
              }}
            />
          </div>

          <button
            onClick={async () => {
              setLoading(true)
              try { await api.admin.patchConfig(config); showToast('Config saved') }
              catch { showToast('Save failed', false) }
              finally { setLoading(false) }
            }}
            style={{
              padding: '10px 24px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer',
              fontFamily: 'inherit', letterSpacing: '0.1em', alignSelf: 'flex-start',
              background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.4)', color: '#818cf8',
            }}
          >
            {loading ? 'SAVING...' : 'SAVE CONFIG'}
          </button>
        </div>
      </Panel>

      {/* DB Stats */}
      <Panel title="DATABASE STATS">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
          {dbStats ? [
            ['DB SIZE', fmtBytes(dbStats.db_size_bytes)],
            ['PLAYERS', fmt(dbStats.players)],
            ['EDGES', fmt(dbStats.edges)],
            ['ELO HISTORY', fmt(dbStats.elo_history)],
            ['QUEUE PENDING', fmt(dbStats.queue_pending)],
            ['QUEUE DONE', fmt(dbStats.queue_done)],
            ['QUEUE FAILED', fmt(dbStats.queue_failed)],
          ].map(([l, v]) => (
            <div key={l} style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 6, padding: '10px 12px', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 9, color: 'var(--text-secondary)', letterSpacing: '0.1em', marginBottom: 4 }}>{l}</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#e8e8f0' }}>{v}</div>
            </div>
          )) : <Skeleton height={80} style={{ gridColumn: '1 / -1' }} />}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={async () => { await api.admin.vacuum(); showToast('VACUUM complete') }}
            style={{ padding: '7px 16px', borderRadius: 5, fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
              background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-primary)', letterSpacing: '0.08em' }}>
            VACUUM DB
          </button>
        </div>
      </Panel>

      {/* Session History */}
      <Panel title="CRAWL SESSION HISTORY">
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr style={{ color: 'var(--text-secondary)', fontSize: 10, letterSpacing: '0.1em' }}>
              {['STARTED', 'STOPPED', 'REASON', 'NODES', 'EDGES'].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '6px 10px', fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sessions.map(s => {
              const dur = s.stopped_at && s.started_at
                ? Math.round((new Date(s.stopped_at).getTime() - new Date(s.started_at).getTime()) / 60000)
                : null
              return (
                <tr key={s.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '7px 10px', color: 'var(--text-secondary)' }}>
                    {new Date(s.started_at).toLocaleString()}
                  </td>
                  <td style={{ padding: '7px 10px', color: 'var(--text-secondary)' }}>
                    {s.stopped_at ? new Date(s.stopped_at).toLocaleString() : '—'}
                  </td>
                  <td style={{ padding: '7px 10px', color: s.reason === 'manual' ? 'var(--text-primary)' : '#ef4444' }}>
                    {s.reason || '—'}
                  </td>
                  <td style={{ padding: '7px 10px' }}>{fmt(s.nodes_crawled || 0)}</td>
                  <td style={{ padding: '7px 10px' }}>{fmt(s.edges_found || 0)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Panel>

      {/* Danger Zone */}
      <Panel title="DANGER ZONE" accent="rgba(239,68,68,0.4)">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {[
            {
              label: 'CLEAR QUEUE',
              desc: 'Reset all pending back to seed user',
              action: () => api.admin.clearQueue().then(() => { showToast('Queue cleared'); refresh() }),
            },
            {
              label: 'WIPE ELO HISTORY',
              desc: 'Truncate elo_history table',
              action: () => api.admin.wipeEloHistory().then(() => { showToast('ELO history wiped'); refresh() }),
            },
            {
              label: 'FULL RESET',
              desc: 'Wipe everything and re-seed from scratch',
              action: () => api.admin.fullReset().then(() => { showToast('Full reset complete'); refresh() }),
            },
          ].map(({ label, desc, action }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#ef4444' }}>{label}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{desc}</div>
              </div>
              <DangerAction label={label} onConfirm={action} />
            </div>
          ))}
        </div>
      </Panel>
    </div>
  )
}
