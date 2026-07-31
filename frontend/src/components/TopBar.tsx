import { clearToken } from '../services/api'
import './TopBar.css'

const THEME_KEY = 'fuel_records_theme'

function getTheme(): string {
  return localStorage.getItem(THEME_KEY) || 'auto'
}

function applyTheme(theme: string) {
  if (theme === 'auto') {
    document.documentElement.removeAttribute('data-theme')
  } else {
    document.documentElement.setAttribute('data-theme', theme)
  }
}

interface TopBarProps {
  theme: string
  onToggleTheme: () => void
}

function TopBar({ theme, onToggleTheme }: TopBarProps) {
  function handleLogout() {
    clearToken()
    window.location.href = '/login'
  }

  return (
    <header className="topbar">
      <span className="topbar-title">Fuel Records</span>
      <div className="topbar-actions">
        <button className="topbar-btn theme-btn" onClick={onToggleTheme} title="切换主题">
          {theme === 'auto' ? '🌓' : theme === 'dark' ? '🌙' : '☀️'}
        </button>
        <button className="topbar-btn logout-btn" onClick={handleLogout} title="退出登录">
          退出
        </button>
      </div>
    </header>
  )
}

export { getTheme, applyTheme }
export default TopBar
