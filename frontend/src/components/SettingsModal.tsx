import { useState, useEffect } from 'react'
import axios from 'axios'
import {
  getDatabaseEnv,
  setDatabaseEnv,
  clearToken,
  getUserCache,
  setUserCache,
  getCurrentUser,
  type UserInfo,
} from '../services/api'
import { checkUpdate, type UpdateInfo } from '../services/upgrade'
import './SettingsModal.css'

const APP_VERSION = import.meta.env.VITE_APP_VERSION as string
const API_BASE = import.meta.env.VITE_API_BASE_URL || ''

interface Props {
  onClose: () => void
}

type CheckStatus = 'idle' | 'checking' | 'latest' | 'available'

export default function SettingsModal({ onClose }: Props) {
  const [dbEnv, setDbEnv] = useState<'prod' | 'test'>(getDatabaseEnv())
  const [checkStatus, setCheckStatus] = useState<CheckStatus>('idle')
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
  const [checkError, setCheckError] = useState('')
  const [switchedEnv, setSwitchedEnv] = useState<'prod' | 'test' | null>(null)
  const [switchError, setSwitchError] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [pendingDb, setPendingDb] = useState<'prod' | 'test' | null>(null)
  const [user, setUser] = useState<UserInfo | null>(getUserCache())

  // 打开弹窗时：先展示缓存，后台静默刷新
  useEffect(() => {
    getCurrentUser()
      .then((fresh) => {
        setUser(fresh)
        setUserCache(fresh)
      })
      .catch(() => {
        // 刷新失败保留缓存值，不提示
      })
  }, [])

  function handleLogout() {
    clearToken()
    window.location.href = '/login'
  }

  async function handleSelectDb(env: 'prod' | 'test') {
    if (env === dbEnv || verifying) return

    setVerifying(true)
    setSwitchError('')

    try {
      const res = await axios.get<{ prod: boolean; test: boolean }>(
        `${API_BASE}/api/v1/health/db`,
        { timeout: 8000 }
      )

      if (!res.data[env]) {
        setSwitchError(
          env === 'test'
            ? '测试库未配置，请在 Render 后端设置 DB_PG_URL_TEST 环境变量后重试'
            : '正式库不可用'
        )
        setVerifying(false)
        return
      }

      setDbEnv(env)
      setDatabaseEnv(env)
      clearToken()
      setSwitchedEnv(env)
      setTimeout(() => {
        window.location.href = '/login'
      }, 1200)
    } catch {
      setSwitchError('网络异常，无法验证数据库状态，请检查网络后重试')
      setVerifying(false)
    }
  }

  async function handleCheckUpdate() {
    setCheckStatus('checking')
    setCheckError('')
    setUpdateInfo(null)

    try {
      const info = await checkUpdate()
      if (info) {
        setUpdateInfo(info)
        setCheckStatus('available')
      } else {
        setCheckStatus('latest')
      }
    } catch {
      setCheckError('检查失败，请检查网络连接')
      setCheckStatus('idle')
    }
  }

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <h3>设置</h3>

        {/* 用户信息 */}
        <div className="settings-section">
          <span className="settings-label">账户</span>
          <div className="settings-user-row">
            <div className="settings-user-avatar">
              {user?.username?.charAt(0).toUpperCase() || '?'}
            </div>
            <div className="settings-user-info">
              <span className="settings-username">{user?.username || '未登录'}</span>
              <span className="settings-user-db">
                {dbEnv === 'prod' ? '正式库' : '测试库'}
              </span>
            </div>
          </div>
          <button className="settings-logout-btn" onClick={handleLogout}>
            退出登录
          </button>
        </div>

        {/* 版本信息 */}
        <div className="settings-section">
          <div className="settings-version-row">
            <span className="settings-label">当前版本</span>
            <span className="settings-version">v{APP_VERSION}</span>
          </div>

          {checkStatus === 'latest' && (
            <p className="settings-check-result success">已是最新版本</p>
          )}
          {checkStatus === 'available' && updateInfo && (
            <div className="settings-update-card">
              <p className="settings-check-result available">
                发现新版本 v{updateInfo.version_name}
              </p>
            </div>
          )}
          {checkError && <p className="settings-check-result error">{checkError}</p>}

          <button
            className="settings-check-btn"
            onClick={handleCheckUpdate}
            disabled={checkStatus === 'checking'}
          >
            {checkStatus === 'checking' ? '检查中…' : '检查更新'}
          </button>
        </div>

        {/* 数据库选择 */}
        <div className="settings-section">
          <span className="settings-label">数据库</span>
          <p className="settings-desc">切换后需重新登录</p>

          {verifying && (
            <div className="settings-switch-toast verifying">验证中…</div>
          )}
          {switchError && (
            <div className="settings-switch-toast error">{switchError}</div>
          )}
          {switchedEnv && (
            <div className="settings-switch-toast success">
              已切换至<span className="settings-switch-env">{switchedEnv === 'prod' ? '正式库' : '测试库'}</span>，即将跳转登录页…
            </div>
          )}

          <div className="settings-env-list">
            <label
              className={`settings-env-option ${dbEnv === 'prod' ? 'active' : ''}`}
              onClick={() => {
                if (dbEnv !== 'prod') setPendingDb('prod')
              }}
            >
              <div className="settings-env-radio">
                {dbEnv === 'prod' && <div className="settings-env-radio-dot" />}
              </div>
              <div className="settings-env-info">
                <span className="settings-env-name">正式库</span>
                <span className="settings-env-url">生产环境数据</span>
              </div>
            </label>

            <label
              className={`settings-env-option ${dbEnv === 'test' ? 'active' : ''}`}
              onClick={() => {
                if (dbEnv !== 'test') setPendingDb('test')
              }}
            >
              <div className="settings-env-radio">
                {dbEnv === 'test' && <div className="settings-env-radio-dot" />}
              </div>
              <div className="settings-env-info">
                <span className="settings-env-name">测试库</span>
                <span className="settings-env-url">测试环境数据</span>
              </div>
            </label>
          </div>

          {/* 确认切换 */}
          {pendingDb && (
            <div className="settings-confirm-bar">
              <span className="settings-confirm-text">
                确认切换到<span className="settings-switch-env">{pendingDb === 'prod' ? '正式库' : '测试库'}</span>？
              </span>
              <div className="settings-confirm-actions">
                <button
                  className="settings-confirm-btn cancel"
                  onClick={() => setPendingDb(null)}
                >
                  取消
                </button>
                <button
                  className="settings-confirm-btn ok"
                  onClick={() => {
                    setPendingDb(null)
                    handleSelectDb(pendingDb)
                  }}
                >
                  确认切换
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 底部 */}
        <div className="settings-actions">
          <button className="settings-btn-cancel" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
    </div>
  )
}
