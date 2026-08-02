import { useState, useRef, useEffect, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import './SmartFAB.css'

type FABBehavior = 'navigate'

interface FABAction {
  behavior: FABBehavior
  target?: string
}

/**
 * 智能 FAB 路由行为映射表
 * 根据当前路径匹配行为：主页 → 统计 / 统计 → 返回
 */
const routeActions: Record<string, FABAction> = {
  '/fuel': { behavior: 'navigate', target: '/fuel/stats' },
  '/fuel/stats': { behavior: 'navigate', target: '/fuel' },
  '/expense': { behavior: 'navigate', target: '/expense/stats' },
  '/expense/stats': { behavior: 'navigate', target: '/expense' },
}

const POSITION_KEY = 'fab_position'
const DEFAULT_BOTTOM = 72
const DEFAULT_RIGHT = 20
const DRAG_THRESHOLD = 5 // px，超过此距离视为拖拽而非点击

/** 火花图标 SVG — 传达智能/灵动感 */
function SparkleIcon() {
  return (
    <svg
      viewBox="0 0 22 22"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M11 2l1.8 5.5h5.7l-4.5 3.5 1.8 5.5L11 13l-4.8 3.5L8 11 3.5 7.5h5.7z" />
    </svg>
  )
}

export default function SmartFAB() {
  const location = useLocation()
  const navigate = useNavigate()
  const fabRef = useRef<HTMLButtonElement>(null)

  // 从 localStorage 恢复位置
  const [position, setPosition] = useState(() => {
    try {
      const saved = localStorage.getItem(POSITION_KEY)
      if (saved) {
        const p = JSON.parse(saved)
        return { bottom: p.bottom ?? DEFAULT_BOTTOM, right: p.right ?? DEFAULT_RIGHT }
      }
    } catch { /* ignore */ }
    return { bottom: DEFAULT_BOTTOM, right: DEFAULT_RIGHT }
  })

  // 拖拽状态
  const [dragging, setDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ y: 0, x: 0, bottom: 0, right: 0 })
  const totalMove = useRef({ y: 0, x: 0 })

  // 保存位置到 localStorage
  const savePosition = useCallback((bottom: number, right: number) => {
    const clampedBottom = Math.max(-20, Math.min(bottom, window.innerHeight + 60))
    const clampedRight = Math.max(-20, Math.min(right, window.innerWidth + 60))
    setPosition({ bottom: clampedBottom, right: clampedRight })
    try {
      localStorage.setItem(POSITION_KEY, JSON.stringify({ bottom: clampedBottom, right: clampedRight }))
    } catch { /* ignore */ }
  }, [])

  // 约束位置在可视区域内（窗口尺寸变化时）
  useEffect(() => {
    function handleResize() {
      setPosition((prev) => {
        const bottom = Math.max(-20, Math.min(prev.bottom, window.innerHeight + 60))
        const right = Math.max(-20, Math.min(prev.right, window.innerWidth + 60))
        if (bottom !== prev.bottom || right !== prev.right) {
          return { bottom, right }
        }
        return prev
      })
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // ── 触摸拖拽 ──
  function handleTouchStart(e: React.TouchEvent) {
    const t = e.touches[0]
    setDragStart({ y: t.clientY, x: t.clientX, bottom: position.bottom, right: position.right })
    totalMove.current = { y: 0, x: 0 }
    setDragging(true)
  }

  useEffect(() => {
    if (!dragging) return

    function handleTouchMove(e: TouchEvent) {
      const t = e.touches[0]
      const dy = dragStart.y - t.clientY
      const dx = dragStart.x - t.clientX
      totalMove.current = { y: dy, x: dx }
      savePosition(dragStart.bottom + dy, dragStart.right + dx)
    }

    function handleTouchEnd() {
      setDragging(false)
    }

    window.addEventListener('touchmove', handleTouchMove, { passive: true })
    window.addEventListener('touchend', handleTouchEnd)
    return () => {
      window.removeEventListener('touchmove', handleTouchMove)
      window.removeEventListener('touchend', handleTouchEnd)
    }
  }, [dragging, dragStart, savePosition])

  // ── 鼠标拖拽 ──
  function handleMouseDown(e: React.MouseEvent) {
    e.preventDefault()
    setDragStart({ y: e.clientY, x: e.clientX, bottom: position.bottom, right: position.right })
    totalMove.current = { y: 0, x: 0 }
    setDragging(true)
  }

  useEffect(() => {
    if (!dragging) return

    function handleMouseMove(e: MouseEvent) {
      const dy = dragStart.y - e.clientY
      const dx = dragStart.x - e.clientX
      totalMove.current = { y: dy, x: dx }
      savePosition(dragStart.bottom + dy, dragStart.right + dx)
    }

    function handleMouseUp() {
      setDragging(false)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [dragging, dragStart, savePosition])

  // ── 点击处理 ──
  function handleClick(e: React.MouseEvent) {
    const totalDist = Math.abs(totalMove.current.y) + Math.abs(totalMove.current.x)
    if (totalDist > DRAG_THRESHOLD) {
      e.preventDefault()
      return
    }

    // 关闭任何图表全屏
    if ((window as any).__chartFullscreenActive) {
      window.dispatchEvent(new CustomEvent('close-chart-fullscreen'))
      return
    }

    const action = routeActions[location.pathname]
    if (action?.behavior === 'navigate' && action.target) {
      navigate(action.target)
    }
  }

  const action = routeActions[location.pathname]
  if (!action) return null

  const isOnStats = location.pathname.includes('/stats')

  return (
    <button
      ref={fabRef}
      className={`smart-fab ${dragging ? 'smart-fab--dragging' : ''} ${isOnStats ? 'smart-fab--back' : ''}`}
      style={{
        bottom: position.bottom,
        right: position.right,
      }}
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
      onClick={handleClick}
      title={isOnStats ? '返回' : '统计'}
    >
      <span className="smart-fab-icon">
        <SparkleIcon />
      </span>
      {isOnStats ? (
        <span className="smart-fab-label">返回</span>
      ) : (
        <span className="smart-fab-label">统计</span>
      )}
    </button>
  )
}
