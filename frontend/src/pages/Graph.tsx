import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, GraphNode, Edge } from '../api'
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

// Status ticker
function Ticker({ stats, crawling }: { stats: { nodes: number; edges: number } | null; crawling: boolean }) {
  const pulse = crawling
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 11, fontWeight: 600, letterSpacing: '0.08em' }}>
      {stats ? (
        <>
          <span style={{ color: 'var(--text-secondary)' }}>
            █ {stats.nodes.toLocaleString()} PLAYERS
          </span>
          <span style={{ color: 'var(--text-muted)' }}>◈</span>
          <span style={{ color: 'var(--text-secondary)' }}>
            {stats.edges.toLocaleString()} CONNECTIONS
          </span>
          <span style={{ color: 'var(--text-muted)' }}>◈</span>
          <span style={{
            color: crawling ? '#10b981' : 'var(--text-secondary)',
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
            {crawling ? (
              <span style={{ display: 'inline-block', animation: 'pulse 1.5s infinite' }}>◉</span>
            ) : '○'} {crawling ? 'CRAWLING...' : 'IDLE'}
          </span>
        </>
      ) : <Skeleton width={280} height={14} />}
    </div>
  )
}

export default function Graph() {
  const [nodes, setNodes] = useState<GraphNode[]>([])
  const [edges, setEdges] = useState<{ source: string; target: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [searchVal, setSearchVal] = useState('')
  const [searchResults, setSearchResults] = useState<GraphNode[]>([])
  const [overview, setOverview] = useState<{ nodes: number; edges: number } | null>(null)
  const [crawling, setCrawling] = useState(false)
  const [is3D] = useState(!isMobile())

  // Filters
  const [minRating, setMinRating] = useState(0)
  const [divFilters, setDivFilters] = useState<Set<number>>(new Set())
  const [proOnly, setProOnly] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)

  const fgRef = useRef<any>(null)
  const [FGComponent, setFGComponent] = useState<any>(null)

  useEffect(() => {
    import('react-force-graph-3d').then(m => setFGComponent(() => m.default))
  }, [])

  useEffect(() => {
    Promise.all([
      api.graph.nodes({ limit: 5000 }),
      api.stats.overview(),
    ]).then(([ns, ov]) => {
      setNodes(ns)
      setOverview({ nodes: ov.total_players, edges: ov.total_edges })
    }).finally(() => setLoading(false))

    // Stream edges
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
      setEdges(edgeList)
    }).catch(() => {})

    // WebSocket for live updates
    const ws = new WebSocket(`ws://${location.host}/api/ws/graph-updates`)
    ws.onmessage = e => {
      const msg = JSON.parse(e.data)
      if (msg.type === 'new_node') {
        setNodes(prev => {
          if (prev.find(n => n.id === msg.node.id)) return prev
          return [...prev, msg.node]
        })
        setOverview(prev => prev ? { ...prev, nodes: prev.nodes + 1 } : prev)
        setCrawling(true)
      }
    }

    // Poll crawler status
    const pollStatus = setInterval(() => {
      api.admin.status().then(s => setCrawling(s.running && !s.paused)).catch(() => {})
    }, 30000)

    return () => {
      ws.close()
      clearInterval(pollStatus)
    }
  }, [])

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
      links: edges.filter(e => idSet.has(e.source) && idSet.has(e.target)),
    }
  }, [nodes, edges, minRating, divFilters, proOnly])

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
      { x: (node as any).x, y: (node as any).y, z: (node as any).z + 120 },
      node,
      1000,
    )
  }, [graphData.nodes])

  return (
    <div style={{ position: 'relative', height: 'calc(100vh - 48px)', overflow: 'hidden' }}>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
      `}</style>

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
                <div
                  key={r.id}
                  onClick={() => { flyToNode(r.id); setSearchVal(''); setSearchResults([]) }}
                  style={{
                    padding: '8px 12px', cursor: 'pointer', fontSize: 12,
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    borderBottom: '1px solid var(--border)',
                    transition: 'background 200ms',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-hover)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <span>{r.nick}</span>
                  <span style={{ color: divisionColor(r.division_type), fontSize: 11 }}>{r.rating}</span>
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
            {[
              [10, 'Unranked', '#9ca3af'],
              [20, 'Bronze', '#cd7f32'],
              [30, 'Silver', '#94a3b8'],
              [40, 'Gold', '#fbbf24'],
              [50, 'Champion', '#6366f1'],
            ].map(([dt, label, color]) => (
              <label key={dt} style={{
                display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6,
                cursor: 'pointer', fontSize: 12, color: 'var(--text-primary)',
              }}>
                <input
                  type="checkbox"
                  checked={divFilters.has(dt as number)}
                  onChange={e => setDivFilters(prev => {
                    const next = new Set(prev)
                    e.target.checked ? next.add(dt as number) : next.delete(dt as number)
                    return next
                  })}
                  style={{ accentColor: color as string }}
                />
                <span style={{ color: color as string }}>{label as string}</span>
              </label>
            ))}
          </div>

          {/* Pro only */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12 }}>
            <input type="checkbox" checked={proOnly} onChange={e => setProOnly(e.target.checked)}
              style={{ accentColor: 'var(--accent)' }} />
            <span>Pro Only</span>
          </label>

          {/* Buttons */}
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
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-secondary)', fontSize: 12, letterSpacing: '0.1em' }}>
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
            linkColor={() => '#1a1a2e'}
            linkOpacity={0.15}
            linkWidth={0.3}
            onNodeClick={handleNodeClick}
            nodeLabel={(n: any) => `${n.nick} (${n.rating})`}
            enableNodeDrag={false}
            enableNavigationControls={true}
            showNavInfo={false}
            {...(is3D ? {
              nodeThreeObject: undefined,
            } : {})}
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
        <span>{graphData.nodes.length.toLocaleString()} nodes  {graphData.links.length.toLocaleString()} edges loaded</span>
        <span style={{ color: crawling ? '#10b981' : 'inherit' }}>
          {crawling ? '● LIVE' : '○ IDLE'}
        </span>
      </div>
    </div>
  )
}
