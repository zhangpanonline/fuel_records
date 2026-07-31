import { useState, useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import TopBar, { getTheme, applyTheme } from './TopBar'
import BottomNav from './BottomNav'
import './Layout.css'

function Layout() {
  const [theme, setTheme] = useState(getTheme)

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
      <BottomNav />
    </div>
  )
}

export default Layout
