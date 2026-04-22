const BASE = '/api'

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = localStorage.getItem('geodb_token')
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init?.headers as Record<string, string> || {}),
  }
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(`${BASE}${path}`, { ...init, headers })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`HTTP ${res.status}: ${err}`)
  }
  return res.json()
}

export const api = {
  graph: {
    nodes: (params?: Record<string, string | number | boolean>) => {
      const q = params ? '?' + new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString() : ''
      return apiFetch<GraphNode[]>(`/graph/nodes${q}`)
    },
    node: (id: string) => apiFetch<{ player: GraphNode; friends: GraphNode[] }>(`/graph/node/${id}`),
    subgraph: (id: string) => apiFetch<{ nodes: GraphNode[]; edges: Edge[] }>(`/graph/subgraph/${id}`),
    search: (q: string) => apiFetch<GraphNode[]>(`/graph/search?q=${encodeURIComponent(q)}`),
  },
  stats: {
    overview: () => apiFetch<Overview>('/stats/overview'),
    ratingDist: () => apiFetch<Bucket[]>('/stats/rating/distribution'),
    eloDist: () => apiFetch<Bucket[]>('/stats/elo/distribution'),
    countries: () => apiFetch<CountryStat[]>('/stats/countries'),
    divisions: () => apiFetch<DivisionStat[]>('/stats/divisions'),
    clubs: () => apiFetch<ClubStat[]>('/stats/clubs'),
    eloHistory: (id: string) => apiFetch<EloPoint[]>(`/stats/elo/history/${id}`),
    leaderboard: (page = 0, country?: string) =>
      apiFetch<GraphNode[]>(`/stats/leaderboard?page=${page}${country ? `&country=${country}` : ''}`),
    crawlProgress: () => apiFetch<ProgressPoint[]>('/stats/crawl/progress'),
  },
  admin: {
    login: (password: string) => apiFetch<{ token: string }>('/admin/login', {
      method: 'POST',
      body: JSON.stringify({ password }),
    }),
    status: () => apiFetch<AdminStatus>('/admin/status'),
    crawlerStart: () => apiFetch<{ ok: boolean }>('/admin/crawler/start', { method: 'POST' }),
    crawlerStop: () => apiFetch<{ ok: boolean }>('/admin/crawler/stop', { method: 'POST' }),
    crawlerPause: () => apiFetch<{ ok: boolean }>('/admin/crawler/pause', { method: 'POST' }),
    config: () => apiFetch<Record<string, string>>('/admin/config'),
    patchConfig: (patch: Record<string, string>) =>
      apiFetch<{ ok: boolean }>('/admin/config', { method: 'PATCH', body: JSON.stringify(patch) }),
    logs: () => apiFetch<{ lines: string[] }>('/admin/logs'),
    sessions: () => apiFetch<CrawlSession[]>('/admin/sessions'),
    dbStats: () => apiFetch<DbStats>('/admin/db/stats'),
    vacuum: () => apiFetch<{ ok: boolean }>('/admin/db/vacuum', { method: 'POST' }),
    refreshAllPlayers: () => apiFetch<{ ok: boolean; queued: number }>('/admin/db/refresh-all-players', { method: 'POST' }),
    clearQueue: () => apiFetch<{ ok: boolean }>('/admin/db/danger/clear-queue', { method: 'POST' }),
    wipeEloHistory: () => apiFetch<{ ok: boolean }>('/admin/db/danger/wipe-elo-history', { method: 'POST' }),
    fullReset: () => apiFetch<{ ok: boolean }>('/admin/db/danger/full-reset', { method: 'POST' }),
  },
}

// Types
export interface GraphNode {
  id: string
  nick: string
  country_code: string
  is_pro: boolean
  subscription_type: string
  is_verified: boolean
  is_banned: boolean
  is_creator: boolean
  flair: number
  club_tag: string
  level: number
  xp: number
  rating: number
  elo: number
  last_rating_change: number
  division_type: number
  on_leaderboard: boolean
  gold_medals: number
  silver_medals: number
  bronze_medals: number
  platinum_medals: number
  crawl_depth: number
  created_at?: string
  last_seen?: string
}

export interface Edge { a: string; b: string }

export interface Overview {
  total_players: number
  total_edges: number
  total_countries: number
  pct_pro: number
  avg_rating: number
}

export interface Bucket {
  label?: string
  min: number
  max: number
  division_type?: number
  count: number
}

export interface CountryStat {
  country_code: string
  player_count: number
  avg_rating: number
  avg_elo: number
}

export interface DivisionStat {
  division_type: number
  count: number
  avg_rating: number
}

export interface ClubStat {
  club_tag: string
  club_id: string
  member_count: number
  avg_rating: number
  avg_elo: number
  avg_level: number
}

export interface EloPoint {
  elo: number
  rating: number
  last_rating_change: number
  recorded_at: string
}

export interface ProgressPoint {
  timestamp: string
  total: number
}

export interface AdminStatus {
  running: boolean
  paused: boolean
  pid: number | null
  queue_pending: number
  queue_done: number
  nodes_this_session: number
  edges_this_session: number
  total_crawled: number
  last_run: string | null
  config: Record<string, string>
}

export interface CrawlSession {
  id: number
  started_at: string
  stopped_at: string
  reason: string
  nodes_crawled: number
  edges_found: number
}

export interface DbStats {
  players: number
  edges: number
  elo_history: number
  queue_pending: number
  queue_done: number
  queue_failed: number
  db_size_bytes: number
}
