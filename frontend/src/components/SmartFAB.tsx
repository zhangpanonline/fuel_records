import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { usePrediction } from '../context/PredictionContext'
import { getActionDisplay, type Action } from '../engine/types'
import type { Rule } from '../engine/types'
import './SmartFAB.css'

const POSITION_KEY = 'fab_position'
const DEFAULT_BOTTOM = 72
const DEFAULT_RIGHT = 20
const DRAG_THRESHOLD = 5
const LONG_PRESS_MS = 500

/** 火花图标 SVG */
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

// ── 降级路由映射（预测引擎不可用或全量种子规则淘汰时使用） ──
const FALLBACK_ROUTES: Record<string, Action> = {
  '/expense': { type: 'navigate', target: '/expense/stats' },
  '/expense/stats': { type: 'navigate', target: '/expense' },
  '/fuel': { type: 'navigate', target: '/fuel/stats' },
  '/fuel/stats': { type: 'navigate', target: '/fuel' },
}

export default function SmartFAB() {
  const navigate = useNavigate()
  const location = useLocation()
  const prediction = usePrediction()
  const fabRef = useRef<HTMLButtonElement>(null)

  // ── 拖拽状态 ──
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
  const [dragging, setDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ y: 0, x: 0, bottom: 0, right: 0 })
  const totalMove = useRef({ y: 0, x: 0 })

  // ── 长按 + 菜单状态 ──
  const [menuOpen, setMenuOpen] = useState(false)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressTriggered = useRef(false)

  // 持久化位置
  const savePosition = useCallback((bottom: number, right: number) => {
    const clampedBottom = Math.max(-20, Math.min(bottom, window.innerHeight + 60))
    const clampedRight = Math.max(-20, Math.min(right, window.innerWidth + 60))
    setPosition({ bottom: clampedBottom, right: clampedRight })
    try {
      localStorage.setItem(POSITION_KEY, JSON.stringify({ bottom: clampedBottom, right: clampedRight }))
    } catch { /* ignore */ }
  }, [])

  // 窗口 resize 时约束位置
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

    // 启动长按计时器
    longPressTriggered.current = false
    longPressTimer.current = setTimeout(() => {
      longPressTriggered.current = true
      setMenuOpen(true)
    }, LONG_PRESS_MS)
  }

  useEffect(() => {
    if (!dragging) return

    function handleTouchMove(e: TouchEvent) {
      const t = e.touches[0]
      const dy = dragStart.y - t.clientY
      const dx = dragStart.x - t.clientX
      totalMove.current = { y: dy, x: dx }

      // 移动超过阈值则取消长按
      if (Math.abs(dy) + Math.abs(dx) > DRAG_THRESHOLD) {
        if (longPressTimer.current) {
          clearTimeout(longPressTimer.current)
          longPressTimer.current = null
        }
      }

      savePosition(dragStart.bottom + dy, dragStart.right + dx)
    }

    function handleTouchEnd() {
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current)
        longPressTimer.current = null
      }
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

    longPressTriggered.current = false
    longPressTimer.current = setTimeout(() => {
      longPressTriggered.current = true
      setMenuOpen(true)
    }, LONG_PRESS_MS)
  }

  useEffect(() => {
    if (!dragging) return

    function handleMouseMove(e: MouseEvent) {
      const dy = dragStart.y - e.clientY
      const dx = dragStart.x - e.clientX
      totalMove.current = { y: dy, x: dx }

      if (Math.abs(dy) + Math.abs(dx) > DRAG_THRESHOLD) {
        if (longPressTimer.current) {
          clearTimeout(longPressTimer.current)
          longPressTimer.current = null
        }
      }

      savePosition(dragStart.bottom + dy, dragStart.right + dx)
    }

    function handleMouseUp() {
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current)
        longPressTimer.current = null
      }
      setDragging(false)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [dragging, dragStart, savePosition])

  // ── 获取当前预测的动作 ──
  const { predictedAction, confidence, display, fallbackAction, isStatsRoute } = useMemo(() => {
    const pred = prediction.currentPrediction
    const fb = FALLBACK_ROUTES[location.pathname]
    const action = pred?.action ?? fb ?? null
    const disp = action ? getActionDisplay(action) : null
    return {
      predictedAction: action,
      confidence: pred?.confidence ?? 0,
      display: disp,
      fallbackAction: fb ?? null,
      isStatsRoute: location.pathname.includes('/stats'),
    }
  }, [prediction.currentPrediction, location.pathname])

  // ── 当前上下文可用的备选动作 ──
  const menuActions = useMemo((): { action: Action; rule: Rule | null; isPredicted: boolean }[] => {
    const matched: { action: Action; rule: Rule; isPredicted: boolean }[] = []

    for (const rule of prediction.rules) {
      // 简单检查 page 匹配（备选菜单只显示当前页相关的规则）
      const cond = rule.condition
      const pageMatch = !cond.page || cond.page === location.pathname
      if (!pageMatch) continue

      // 避免重复 Action
      const already = matched.find(
        (m) =>
          getActionDisplay(m.action).label === getActionDisplay(rule.action).label,
      )
      if (already) continue

      matched.push({
        action: rule.action,
        rule,
        isPredicted: predictedAction
          ? getActionDisplay(rule.action).label === display?.label
          : false,
      })
    }

    matched.sort((a, b) => (b.rule?.weight ?? 0) - (a.rule?.weight ?? 0))

    // 将预测动作放到最前面
    const predIdx = matched.findIndex((m) => m.isPredicted)
    if (predIdx > 0) {
      const [item] = matched.splice(predIdx, 1)
      matched.unshift(item)
    }

    // 如果没有匹配的动作但有降级动作，至少显示降级选项
    if (matched.length === 0 && fallbackAction) {
      matched.push({ action: fallbackAction, rule: null, isPredicted: true })
    }

    return matched
  }, [prediction.rules, location.pathname, predictedAction, display, fallbackAction])

  // ── 执行动作 ──
  const executeAction = useCallback(
    (action: Action) => {
      const disp = getActionDisplay(action)
      if (action.type === 'navigate') {
        // 记录反馈
        const wasHit = predictedAction
          ? getActionDisplay(predictedAction).label === disp.label
          : false
        ;(window as any).__fabRecordFeedback?.(action, wasHit)

        // 先关闭菜单
        setMenuOpen(false)
        navigate(action.target)
      } else {
        // 非导航动作：写入 pendingAction
        const wasHit = predictedAction
          ? getActionDisplay(predictedAction).label === disp.label
          : false
        ;(window as any).__fabRecordFeedback?.(action, wasHit)

        setMenuOpen(false)
        prediction.updatePageState({})
        // 通过设置 pendingAction 触发页面执行
        // 这里使用 PredictionContext 的 executeAction
        ;(window as any).__fabExecuteAction?.(action)
      }
    },
    [predictedAction, navigate, prediction],
  )

  // ── 单击处理 ──
  function handleClick(e: React.MouseEvent) {
    const totalDist = Math.abs(totalMove.current.y) + Math.abs(totalMove.current.x)
    if (totalDist > DRAG_THRESHOLD) {
      e.preventDefault()
      return
    }

    // 长按已触发菜单，不处理单击
    if (longPressTriggered.current) {
      longPressTriggered.current = false
      return
    }

    // 关闭任何图表全屏
    if ((window as any).__chartFullscreenActive && !menuOpen) {
      window.dispatchEvent(new CustomEvent('close-chart-fullscreen'))
      return
    }

    if (predictedAction) {
      executeAction(predictedAction)
    } else if (fallbackAction) {
      executeAction(fallbackAction)
    }
  }

  // ── 渲染 ──
  const isHighConfidence = confidence > 2
  const isBackMode = isStatsRoute || display?.label.includes('返回')

  return (
    <>
      <button
        ref={fabRef}
        className={`smart-fab ${dragging ? 'smart-fab--dragging' : ''} ${isBackMode ? 'smart-fab--back' : ''} ${isHighConfidence ? 'smart-fab--high-confidence' : ''}`}
        style={{
          bottom: position.bottom,
          right: position.right,
        }}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        onClick={handleClick}
        title={display?.label ?? '快捷操作'}
      >
        <span className="smart-fab-icon">
          <SparkleIcon />
        </span>
        <span className="smart-fab-label">{display?.label ?? '快捷'}</span>
      </button>

      {/* 备选菜单 */}
      {menuOpen && (
        <div
          className="fab-menu-overlay"
          onClick={() => setMenuOpen(false)}
        >
          <div
            className="fab-menu"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="fab-menu-header">快捷操作</div>
            {menuActions.map((item, i) => {
              const disp = getActionDisplay(item.action)
              return (
                <div
                  key={`${disp.label}_${i}`}
                  className={`fab-menu-item ${item.isPredicted ? 'fab-menu-item--predicted' : ''}`}
                  onClick={() => executeAction(item.action)}
                >
                  <span className="fab-menu-item-icon">{disp.icon}</span>
                  <span className="fab-menu-item-label">{disp.label}</span>
                  {item.isPredicted && (
                    <span className="fab-menu-item-badge">推荐</span>
                  )}
                  {item.rule && (
                    <span
                      className="fab-menu-item-weight"
                      style={{ color: item.rule.weight >= 0 ? '#22c55e' : '#ef4444' }}
                    >
                      {item.rule.weight > 0 ? `+${item.rule.weight}` : item.rule.weight}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </>
  )
}
