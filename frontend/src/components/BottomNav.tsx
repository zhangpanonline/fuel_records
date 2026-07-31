import { useNavigate, useLocation } from 'react-router-dom'
import './BottomNav.css'

function BottomNav() {
  const navigate = useNavigate()
  const location = useLocation()

  const tabs = [
    { path: '/fuel', label: '油耗', icon: '⛽' },
    { path: '/expense', label: '记账', icon: '💰' },
  ]

  return (
    <nav className="bottom-nav">
      {tabs.map((tab) => {
        const isActive = location.pathname.startsWith(tab.path)
        return (
          <button
            key={tab.path}
            className={`bottom-nav-btn ${isActive ? 'active' : ''}`}
            onClick={() => navigate(tab.path)}
          >
            <span className="bottom-nav-icon">{tab.icon}</span>
            <span className="bottom-nav-label">{tab.label}</span>
          </button>
        )
      })}
    </nav>
  )
}

export default BottomNav
