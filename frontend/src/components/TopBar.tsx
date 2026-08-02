import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import SettingsModal from './SettingsModal'
import './TopBar.css'

const THEME_KEY = 'fuel_records_theme'

export function getTheme(): string {
  return localStorage.getItem(THEME_KEY) || 'auto'
}

export function applyTheme(theme: string) {
  if (theme === 'auto') {
    document.documentElement.removeAttribute('data-theme')
  } else {
    document.documentElement.setAttribute('data-theme', theme)
  }
}

const pageTitles: Record<string, string> = {
  '/fuel': '油耗',
  '/fuel/stats': '油耗统计',
  '/expense': '记账',
  '/expense/stats': '记账统计',
}

interface TopBarProps {
  theme: string
  onToggleTheme: () => void
}

function TopBar({ theme, onToggleTheme }: TopBarProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const [showSettings, setShowSettings] = useState(false)

  const title = pageTitles[location.pathname] || '油耗'
  const isSubPage = location.pathname.split('/').filter(Boolean).length > 1

  function handleBack() {
    navigate(-1)
  }

  return (
    <>
    <header className="topbar">
      <div className="topbar-left">
        {isSubPage && (
          <button className="topbar-btn back-btn" onClick={handleBack} title="返回">
            ← 返回
          </button>
        )}
        <span className="topbar-title">{title}</span>
      </div>
      <div className="topbar-actions">
        <button className="topbar-btn theme-btn" onClick={onToggleTheme} title="切换主题">
          {theme === 'auto' ? '🌓' : theme === 'dark' ? '🌙' : '☀️'}
        </button>
        <button className="topbar-btn settings-btn" onClick={() => setShowSettings(true)} title="设置">
          ⚙
        </button>
      </div>
    </header>
    {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
  </>
  )
}

export default TopBar
