import { useState, useEffect } from 'react'

/* 通用分类操作弹框：重命名 / 添加子级 / 添加同级 */

export type ModalMode = 'rename' | 'addChild' | 'addSibling'

interface CategoryModalProps {
  title: string
  initialValue: string
  error: string
  onClose: () => void
  onConfirm: (name: string) => void
}

export default function CategoryModal({
  title,
  initialValue,
  error,
  onClose,
  onConfirm,
}: CategoryModalProps) {
  const [value, setValue] = useState(initialValue)

  useEffect(() => {
    setValue(initialValue)
  }, [initialValue])

  function handleConfirm() {
    const v = value.trim()
    if (!v) return
    onConfirm(v)
  }

  return (
    <div className="rename-overlay" onClick={onClose}>
      <div className="rename-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="rename-dialog-title">{title}</div>
        <input
          className="rename-dialog-input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleConfirm()
            if (e.key === 'Escape') onClose()
          }}
          autoFocus
        />
        {error && <div className="rename-dialog-error">{error}</div>}
        <div className="rename-dialog-actions">
          <button className="rename-dialog-cancel" onClick={onClose}>
            取消
          </button>
          <button className="rename-dialog-ok" onClick={handleConfirm}>
            确认
          </button>
        </div>
      </div>
    </div>
  )
}
