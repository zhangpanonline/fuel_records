import { useState, useEffect, type FormEvent } from 'react'
import { login, register, setToken, getCurrentUser, setUserCache } from '../services/api'
import SettingsModal from '../components/SettingsModal'

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

function LoginPage() {
  const [isRegister, setIsRegister] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [theme, setTheme] = useState(getTheme)
  const [showSettings, setShowSettings] = useState(false)

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  function handleToggleTheme() {
    const next: Record<string, string> = { auto: 'light', light: 'dark', dark: 'auto' }
    const newTheme = next[theme] || 'auto'
    setTheme(newTheme)
    localStorage.setItem(THEME_KEY, newTheme)
    applyTheme(newTheme)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()

    if (!username.trim() || !password) {
      alert('请填写用户名和密码')
      return
    }

    if (isRegister && password !== confirmPassword) {
      alert('两次密码不一致')
      return
    }

    setSubmitting(true)
    try {
      let result
      if (isRegister) {
        result = await register(username, password)
      } else {
        result = await login(username, password)
      }
      setToken(result.access_token)
      // 立即获取用户信息并缓存
      try {
        const user = await getCurrentUser()
        setUserCache(user)
      } catch {
        // 获取用户信息失败不影响登录流程（后台静默失败）
      }
      window.location.href = '/'
    } catch (err: unknown) {
      console.error('认证失败:', err)
      alert('操作失败，请稍后重试')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
    <div className="app">
      <div className="header">
        <h1 className="title">油耗记录</h1>
        <div className="header-actions">
          <button className="theme-btn" onClick={() => setShowSettings(true)} title="数据源设置" style={{ marginRight: 8 }}>
            ⚙
          </button>
          <button className="theme-btn" onClick={handleToggleTheme}>
            {theme === 'auto' ? '🌓' : theme === 'dark' ? '🌙' : '☀️'}
          </button>
        </div>
      </div>

      {/* Tab 切换 */}
      <div className="auth-tabs">
        <button
          className={`auth-tab ${!isRegister ? 'active' : ''}`}
          onClick={() => setIsRegister(false)}
        >
          登录
        </button>
        <button
          className={`auth-tab ${isRegister ? 'active' : ''}`}
          onClick={() => setIsRegister(true)}
        >
          注册
        </button>
      </div>

      {/* 表单 */}
      <form className="auth-form animate-in" onSubmit={handleSubmit}>
        <label>
          用户名
          <input
            type="text"
            placeholder="输入用户名"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            minLength={2}
          />
        </label>
        <label>
          密码
          <input
            type="password"
            placeholder={isRegister ? '至少 6 位密码' : '输入密码'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={isRegister ? 6 : 1}
          />
        </label>
        {isRegister && (
          <label>
            确认密码
            <input
              type="password"
              placeholder="再次输入密码"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </label>
        )}
        <button type="submit" className="submit-btn" disabled={submitting}>
          {submitting ? '请稍候...' : isRegister ? '注册' : '登录'}
        </button>
      </form>

      <p className="auth-hint animate-in stagger-1">
        {isRegister ? '已有账号？' : '没有账号？'}
        <button
          className="link-btn"
          onClick={() => {
            setIsRegister(!isRegister)
            setConfirmPassword('')
          }}
        >
          {isRegister ? '去登录' : '去注册'}
        </button>
      </p>
    </div>

    <p className="app-version">v{import.meta.env.VITE_APP_VERSION || '1.0.0'}</p>
    {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
  </>)
}

export default LoginPage
