import { useState, useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import TopBar, { getTheme, applyTheme } from './TopBar'
import BottomNav from './BottomNav'
import SmartFAB from './SmartFAB'
import './Layout.css'

function Layout() {
  const [theme, setTheme] = useState(getTheme)
  const location = useLocation()
  const isDocsPage = location.pathname === '/docs'

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  function handleToggleTheme() {
    const next: Record<string, string> = { auto: 'light', light: 'dark', dark: 'auto' }
    const newTheme = next[theme] || 'auto'
    setTheme(newTheme)
    localStorage.setItem('fuel_records_theme', newTheme)
  }

  return (
    <div className="app">
      <TopBar theme={theme} onToggleTheme={handleToggleTheme} />
      <main className="layout-content">
        <Outlet />
      </main>
      {!isDocsPage && <BottomNav />}
      {!isDocsPage && <SmartFAB />}
    </div>
  )
}

export default Layout
