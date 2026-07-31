import { useState, useEffect, type FormEvent } from 'react'
import axios from 'axios'
import { login, register, setToken } from '../services/api'

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
      // 跳转到主页
      window.location.href = '/'
    } catch (err: unknown) {
      let msg = '操作失败，请重试'
      if (axios.isAxiosError(err) && err.response?.data?.detail) {
        msg = err.response.data.detail
      } else if (err instanceof Error) {
        msg = err.message
      }
      alert(msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="app">
      <div className="header">
        <h1 className="title">油耗记录</h1>
        <button className="theme-btn" onClick={handleToggleTheme}>
          {theme === 'auto' ? '🌓' : theme === 'dark' ? '🌙' : '☀️'}
        </button>
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

      <p className="app-version">v{import.meta.env.VITE_APP_VERSION || '1.0.0'}</p>
    </div>
  )
}

export default LoginPage
