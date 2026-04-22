import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, GraphNode } from '../api'
import { NodeSidebar } from '../components/NodeSidebar'
import { divisionColor } from '../components/DivisionBadge'
import { Skeleton } from '../components/Skeleton'

const DIV_COLORS: Record<number, string> = {
  10: '#4b5563',
  20: '#cd7f32',
  30: '#94a3b8',
  40: '#fbbf24',
  50: '#6366f1',
}

function nodeColor(d: GraphNode) {
  return DIV_COLORS[d.division_type] || '#4b5563'
}
function nodeSize(d: GraphNode) {
  const base = Math.max(2, Math.min(12, 2 + Math.log10(Math.max(1, d.rating || 1)) * 2))
  return d.division_type === 50 ? base * 1.3 : base
}

const isMobile = () => typeof window !== 'undefined' && window.innerWidth < 768

function Ticker({ stats, crawling }: { stats: { nodes: number; edges: number } | null; crawling: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 11, fontWeight: 600, letterSpacing: '0.08em' }}>
      {stats ? (
        <>
          <span style={{ color: 'var(--text-secondary)' }}>█ {stats.nodes.toLocaleString()} PLAYERS</span>
          <span style={{ color: 'var(--text-muted)' }}>◈</span>
          <span style={{ color: 'var(--text-secondary)' }}>{stats.edges.toLocaleString()} CONNECTIONS</span>
          <span style={{ color: 'var(--text-muted)' }}>◈</span>
          <span style={{ color: crawling ? '#10b981' : 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}>
            {crawling
              ? <span style={{ display: 'inline-block', animation: 'pulse 1.5s infinite' }}>◉</span>
              : '○'
            } {crawling ? 'CRAWLING...' : 'IDLE'}
          </span>
        </>
      ) : <Skeleton width={280} height={14} />}
    </div>
  )
}

export default function Graph() {
  const navigate = useNavigate()
  const [nodes, setNodes] = useState<GraphNode[]>([])
  // Store edges as a ref so streaming updates don't trigger simulation restarts
  const edgesRef = useRef<{ source: string; target: string }[]>([])
  const [edgesReady, setEdgesReady] = useState(false)
  const [showEdges, setShowEdges] = useState(true)

  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [searchVal, setSearchVal] = useState('')
  const [searchResults, setSearchResults] = useState<GraphNode[]>([])
  const [overview, setOverview] = useState<{ nodes: number; edges: number } | null>(null)
  const [crawling, setCrawling] = useState(false)

  // Filters
  const [minRating, setMinRating] = useState(0)
  const [divFilters, setDivFilters] = useState<Set<number>>(new Set())
  const [proOnly, setProOnly] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)

  // Track whether the simulation has settled so we stop it from auto-zooming
  const engineStopped = useRef(false)
  const fgRef = useRef<any>(null)
  const [FGComponent, setFGComponent] = useState<any>(null)

  useEffect(() => {
    import('react-force-graph-3d').then(m => setFGComponent(() => m.default))
  }, [])

  const GRAPH_REFRESH_MS = 2 * 60 * 60 * 1000 // 2 hours

  const loadGraph = useCallback((silent = false) => {
    if (!silent) setLoading(true)
    setEdgesReady(false)
    edgesRef.current = []
    engineStopped.current = false

    Promise.all([
      api.graph.nodes({ limit: 5000 }),
      api.stats.overview(),
    ]).then(([ns, ov]) => {
      setNodes(ns)
      setOverview({ nodes: ov.total_players, edges: ov.total_edges })
    }).finally(() => { if (!silent) setLoading(false) })

    fetch('/api/graph/edges').then(async res => {
      const reader = res.body?.getReader()
      const decoder = new TextDecoder()
      const edgeList: { source: string; target: string }[] = []
      while (reader) {
        const { done, value } = await reader.read()
        if (done) break
        const text = decoder.decode(value)
        for (const line of text.split('\n')) {
          if (!line.trim()) continue
          try {
            const { a, b } = JSON.parse(line)
            edgeList.push({ source: a, target: b })
          } catch { /* skip */ }
        }
      }
      edgesRef.current = edgeList
      setEdgesReady(true)
    }).catch(() => { setEdgesReady(true) })
  }, [])

  useEffect(() => {
    loadGraph()

    // Periodic silent refresh — updates the graph without interrupting interaction
    const refreshTimer = setInterval(() => loadGraph(true), GRAPH_REFRESH_MS)

    // WebSocket: crawling indicator only — does NOT push nodes into the graph
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${proto}//${location.host}/api/ws/graph-updates`)
    ws.onmessage = e => {
      const msg = JSON.parse(e.data)
      if (msg.type === 'new_node') setCrawling(true)
    }

    const pollStatus = setInterval(() => {
      api.admin.status().then(s => setCrawling(s.running && !s.paused)).catch(() => {})
    }, 30000)

    return () => { ws.close(); clearInterval(refreshTimer); clearInterval(pollStatus) }
  }, [loadGraph])

  // graphData only rebuilds when filters or edgesReady changes — not on every streaming chunk
  const graphData = useMemo(() => {
    const filtered = nodes.filter(n => {
      if (minRating > 0 && (n.rating || 0) < minRating) return false
      if (divFilters.size > 0 && !divFilters.has(n.division_type)) return false
      if (proOnly && !n.is_pro) return false
      return true
    })
    const idSet = new Set(filtered.map(n => n.id))
    return {
      nodes: filtered.map(n => ({ ...n, id: n.id })),
      links: showEdges && edgesReady
        ? edgesRef.current.filter(e => idSet.has(e.source) && idSet.has(e.target))
        : [],
    }
  }, [nodes, edgesReady, showEdges, minRating, divFilters, proOnly])

  const handleNodeClick = useCallback((node: any) => {
    setSelectedId(node.id)
  }, [])

  const handleSearch = useCallback((q: string) => {
    setSearchVal(q)
    if (q.length < 2) { setSearchResults([]); return }
    api.graph.search(q).then(setSearchResults)
  }, [])

  const flyToNode = useCallback((id: string) => {
    setSelectedId(id)
    if (!fgRef.current) return
    const node = graphData.nodes.find(n => n.id === id)
    if (!node) return
    fgRef.current.cameraPosition?.(
      { x: (node as any).x, y: (node as any).y, z: (node as any).z + 150 },
      node,
      800,
    )
  }, [graphData.nodes])

  // After the simulation settles, freeze it so it stops interfering with zoom
  const handleEngineStop = useCallback(() => {
    if (!engineStopped.current && fgRef.current) {
      engineStopped.current = true
      // Lock the simulation so user zoom is never overridden again
      fgRef.current.d3Force?.('charge')?.strength(0)
    }
  }, [])

  return (
    <div style={{ position: 'relative', height: 'calc(100vh - 48px)', overflow: 'hidden' }}>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>

      {/* Top overlay bar */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 44, zIndex: 100,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 16px',
        background: 'rgba(5,5,8,0.7)', borderBottom: '1px solid var(--border)',
        backdropFilter: 'blur(8px)',
      }}>
        <button
          onClick={() => setSidebarOpen(v => !v)}
          style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 4,
            color: 'var(--text-secondary)', cursor: 'pointer', padding: '3px 8px', fontSize: 10, fontFamily: 'inherit' }}
        >
          {sidebarOpen ? '◂ FILTERS' : '▸ FILTERS'}
        </button>
        <Ticker stats={overview} crawling={crawling} />
        <button
          onClick={() => loadGraph()}
          title="Reload graph data"
          style={{
            background: 'none', border: '1px solid var(--border)', borderRadius: 4,
            color: 'var(--text-secondary)', cursor: 'pointer', padding: '3px 8px',
            fontSize: 10, fontFamily: 'inherit', letterSpacing: '0.06em',
          }}
        >
          ↺ REFRESH
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative' }}>
          <input
            value={searchVal}
            onChange={e => handleSearch(e.target.value)}
            placeholder="SEARCH PLAYER..."
            style={{
              background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 4,
              color: 'var(--text-primary)', fontSize: 11, padding: '4px 10px',
              fontFamily: 'inherit', outline: 'none', width: searchVal ? 200 : 140,
              transition: 'width 200ms ease-out',
            }}
          />
          {searchResults.length > 0 && (
            <div style={{
              position: 'absolute', top: '100%', right: 0, width: 240, marginTop: 4,
              background: 'rgba(10,10,16,0.98)', border: '1px solid var(--border)',
              borderRadius: 6, overflow: 'hidden', zIndex: 200,
            }}>
              {searchResults.slice(0, 8).map(r => (
                <div key={r.id}
                  style={{ padding: '8px 12px', fontSize: 12,
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    borderBottom: '1px solid var(--border)', transition: 'background 200ms',
                    gap: 8 }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-hover)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <span
                    style={{ cursor: 'pointer', flex: 1 }}
                    onClick={() => { flyToNode(r.id); setSearchVal(''); setSearchResults([]) }}
                  >{r.nick}</span>
                  <span style={{ color: divisionColor(r.division_type), fontSize: 11 }}>{r.rating}</span>
                  <span
                    onClick={() => navigate(`/player/${r.id}`)}
                    style={{ fontSize: 9, color: '#818cf8', cursor: 'pointer', letterSpacing: '0.06em', flexShrink: 0 }}
                  >PROFILE</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Left filter sidebar */}
      {sidebarOpen && (
        <div style={{
          position: 'absolute', top: 44, left: 0, bottom: 32, width: 240, zIndex: 100,
          background: 'rgba(5,5,8,0.85)', borderRight: '1px solid var(--border)',
          backdropFilter: 'blur(12px)', padding: 16, overflowY: 'auto',
          display: 'flex', flexDirection: 'column', gap: 16,
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', color: 'var(--text-secondary)' }}>
            FILTERS
          </div>

          {/* Edge toggle */}
          <label style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            cursor: 'pointer', fontSize: 11, color: 'var(--text-secondary)',
          }}>
            <span>SHOW CONNECTIONS</span>
            <div
              onClick={() => setShowEdges(v => !v)}
              style={{
                width: 36, height: 20, borderRadius: 10, cursor: 'pointer',
                background: showEdges ? 'rgba(99,102,241,0.6)' : 'rgba(255,255,255,0.1)',
                border: `1px solid ${showEdges ? 'rgba(99,102,241,0.8)' : 'var(--border)'}`,
                position: 'relative', transition: 'all 250ms ease-out', flexShrink: 0,
              }}
            >
              <div style={{
                position: 'absolute', top: 2, left: showEdges ? 18 : 2,
                width: 14, height: 14, borderRadius: '50%',
                background: showEdges ? '#818cf8' : '#4b5563',
                transition: 'all 250ms ease-out',
              }} />
            </div>
          </label>

          {/* Min rating slider */}
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 6 }}>
              MIN RATING: <span style={{ color: 'var(--text-primary)' }}>{minRating}</span>
            </div>
            <input type="range" min={0} max={2500} step={50} value={minRating}
              onChange={e => setMinRating(Number(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--accent)' }}
            />
          </div>

          {/* Division filter */}
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 8 }}>DIVISION</div>
            {([
              [10, 'Unranked', '#9ca3af'],
              [20, 'Bronze', '#cd7f32'],
              [30, 'Silver', '#94a3b8'],
              [40, 'Gold', '#fbbf24'],
              [50, 'Champion', '#6366f1'],
            ] as [number, string, string][]).map(([dt, label, color]) => (
              <label key={dt} style={{
                display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6,
                cursor: 'pointer', fontSize: 12, color: 'var(--text-primary)',
              }}>
                <input type="checkbox"
                  checked={divFilters.has(dt)}
                  onChange={e => setDivFilters(prev => {
                    const next = new Set(prev)
                    e.target.checked ? next.add(dt) : next.delete(dt)
                    return next
                  })}
                  style={{ accentColor: color }}
                />
                <span style={{ color }}>{label}</span>
              </label>
            ))}
          </div>

          {/* Pro only */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12 }}>
            <input type="checkbox" checked={proOnly} onChange={e => setProOnly(e.target.checked)}
              style={{ accentColor: 'var(--accent)' }} />
            <span>Pro Only</span>
          </label>

          <button
            onClick={() => { setMinRating(0); setDivFilters(new Set()); setProOnly(false) }}
            style={{
              padding: '8px 0', borderRadius: 6, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
              cursor: 'pointer', fontFamily: 'inherit', background: 'var(--surface)',
              border: '1px solid var(--border)', color: 'var(--text-secondary)', width: '100%',
            }}
          >
            RESET
          </button>
        </div>
      )}

      {/* 3D Graph canvas */}
      <div style={{ position: 'absolute', inset: 0, top: 44, bottom: 32 }}>
        {loading || !FGComponent ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%',
            color: 'var(--text-secondary)', fontSize: 12, letterSpacing: '0.1em' }}>
            LOADING GRAPH...
          </div>
        ) : (
          <FGComponent
            ref={fgRef}
            graphData={graphData}
            nodeId="id"
            linkSource="source"
            linkTarget="target"
            backgroundColor="#050508"
            nodeColor={(n: any) => nodeColor(n)}
            nodeVal={(n: any) => nodeSize(n)}
            // Edges: visible by default, coloured by source node division
            linkColor={(link: any) => {
              const src = graphData.nodes.find(n => n.id === (link.source?.id ?? link.source))
              return src ? DIV_COLORS[src.division_type] || '#374151' : '#374151'
            }}
            linkOpacity={0.35}
            linkWidth={0.8}
            onNodeClick={handleNodeClick}
            nodeLabel={(n: any) => `${n.nick} (${n.rating})`}
            enableNodeDrag={false}
            enableNavigationControls={true}
            showNavInfo={false}
            // Stop simulation from restarting and resetting zoom
            cooldownTicks={120}
            onEngineStop={handleEngineStop}
            // Don't auto-fit on data change
            onDagError={() => {}}
          />
        )}
      </div>

      {/* Node sidebar */}
      <NodeSidebar
        nodeId={selectedId}
        onClose={() => setSelectedId(null)}
        onExpandNetwork={flyToNode}
      />

      {/* Bottom bar */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: 32, zIndex: 100,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 16px', fontSize: 10, color: 'var(--text-muted)',
        background: 'rgba(5,5,8,0.7)', borderTop: '1px solid var(--border)',
        backdropFilter: 'blur(8px)', letterSpacing: '0.06em',
      }}>
        <span>
          {graphData.nodes.length.toLocaleString()} nodes
          {showEdges ? `  ${graphData.links.length.toLocaleString()} edges` : '  edges hidden'}
        </span>
        <span style={{ color: crawling ? '#10b981' : 'inherit' }}>
          {crawling ? '● LIVE' : '○ IDLE'}
        </span>
      </div>
    </div>
  )
}
