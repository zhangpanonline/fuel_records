import { useState, useEffect } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import TopBar, { getTheme, applyTheme } from './TopBar'
import BottomNav from './BottomNav'
import SmartFAB from './SmartFAB'
import { PredictionProvider } from '../context/PredictionContext'
import './Layout.css'

function Layout() {
  const [theme, setTheme] = useState(getTheme)
  const location = useLocation()
  const navigate = useNavigate()
  const isDocsPage = location.pathname === '/docs'
  const isPredictPage = location.pathname === '/predict/rules'

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  function handleToggleTheme() {
    const next: Record<string, string> = { auto: 'light', light: 'dark', dark: 'auto' }
    const newTheme = next[theme] || 'auto'
    setTheme(newTheme)
    localStorage.setItem('fuel_records_theme', newTheme)
  }

  const isHiddenNav = isDocsPage || isPredictPage

  return (
    <PredictionProvider>
      <div className="app">
        <TopBar theme={theme} onToggleTheme={handleToggleTheme} onNavigate={navigate} />
        <main className="layout-content">
          <Outlet />
        </main>
        {!isHiddenNav && <BottomNav />}
        {!isHiddenNav && <SmartFAB />}
      </div>
    </PredictionProvider>
  )
}

export default Layout
