import { useState } from 'react'
import { downloadApk, installApk, type UpdateInfo } from '../services/upgrade'
import './UpgradeModal.css'

interface Props {
  updateInfo: UpdateInfo
  currentVersion: string
  onClose: () => void
}

export default function UpgradeModal({ updateInfo, currentVersion, onClose }: Props) {
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null)
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const [installing, setInstalling] = useState(false)

  async function handleStartDownload() {
    setDownloadProgress(0)
    setDownloadError(null)
    try {
      const localUri = await downloadApk(updateInfo.apk_url, (pct) => {
        setDownloadProgress(pct)
      })
      setDownloadProgress(null)
      setInstalling(true)
      await installApk(localUri)
      onClose()
    } catch (err) {
      setDownloadProgress(null)
      setInstalling(false)
      setDownloadError(
        err instanceof Error ? err.message : '下载失败，请重试'
      )
    }
  }

  async function handleRetryDownload() {
    setDownloadError(null)
    await handleStartDownload()
  }

  return (
    <div className="upgrade-overlay" onClick={onClose}>
      <div className="upgrade-modal animate-scale" onClick={(e) => e.stopPropagation()}>
        {downloadProgress !== null ? (
          <>
            <h2 className="upgrade-title">正在下载更新</h2>
            <div className="upgrade-progress-bar">
              <div
                className="upgrade-progress-fill"
                style={{ width: `${downloadProgress}%` }}
              />
            </div>
            <p className="upgrade-progress-text">
              正在下载... {downloadProgress}%
            </p>
          </>
        ) : installing ? (
          <>
            <h2 className="upgrade-title">正在准备安装</h2>
            <p className="upgrade-body">即将打开系统安装器…</p>
          </>
        ) : downloadError ? (
          <>
            <h2 className="upgrade-title">下载失败</h2>
            <p className="upgrade-body">{downloadError}</p>
            <div className="upgrade-actions">
              <button className="upgrade-btn secondary" onClick={handleRetryDownload}>
                重试
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 className="upgrade-title">发现新版本</h2>
            <p className="upgrade-body">
              当前版本：v{currentVersion}
              <br />
              最新版本：v{updateInfo.version_name}
            </p>
            <div className="upgrade-actions">
              <button
                className="upgrade-btn secondary"
                onClick={onClose}
              >
                暂不更新
              </button>
              <button className="upgrade-btn primary" onClick={handleStartDownload}>
                立即更新
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
