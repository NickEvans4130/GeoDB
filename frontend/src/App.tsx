import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import Graph from './pages/Graph'
import Stats from './pages/Stats'
import Admin from './pages/Admin'

export default function App() {
  return (
    <BrowserRouter>
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1000,
        display: 'flex', alignItems: 'center', gap: 24,
        padding: '0 24px', height: 48,
        background: 'rgba(5,5,8,0.85)',
        borderBottom: '1px solid var(--border)',
        backdropFilter: 'blur(12px)',
      }}>
        <span style={{ fontWeight: 700, fontSize: 14, letterSpacing: '0.2em', color: 'rgba(255,255,255,0.4)' }}>
          GEODB
        </span>
        <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
          {[['/', 'GRAPH'], ['/stats', 'STATS'], ['/admin', 'ADMIN']].map(([to, label]) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              style={({ isActive }) => ({
                padding: '4px 12px',
                borderRadius: 4,
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '0.1em',
                textDecoration: 'none',
                color: isActive ? '#e8e8f0' : 'var(--text-secondary)',
                background: isActive ? 'var(--surface-hover)' : 'transparent',
                border: `1px solid ${isActive ? 'var(--border)' : 'transparent'}`,
                transition: 'all 200ms ease-out',
              })}
            >
              {label}
            </NavLink>
          ))}
        </div>
      </nav>
      <div style={{ paddingTop: 48, height: '100vh' }}>
        <Routes>
          <Route path="/" element={<Graph />} />
          <Route path="/stats" element={<Stats />} />
          <Route path="/admin" element={<Admin />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}
