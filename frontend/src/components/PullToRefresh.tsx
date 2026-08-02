import { useState, useRef, useCallback, type ReactNode, type TouchEvent } from 'react'
import './PullToRefresh.css'

interface Props {
  onRefresh: () => Promise<void>
  skeleton: ReactNode
  children: ReactNode
}

const PULL_THRESHOLD = 60
const MAX_PULL = 100

function getScrollEl(): HTMLElement | null {
  return document.querySelector('.layout-content') as HTMLElement | null
}

function isAtTop(): boolean {
  const el = getScrollEl()
  const elAtTop = el ? el.scrollTop <= 5 : true
  const docAtTop = window.scrollY <= 5
  return elAtTop && docAtTop
}

export default function PullToRefresh({ onRefresh, skeleton, children }: Props) {
  const pullDistanceRef = useRef(0)
  const [pullDistance, setPullDistance] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const startY = useRef(0)
  const startX = useRef(0)
  const pulling = useRef(false)

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (!isAtTop()) {
      pulling.current = false
      return
    }
    startY.current = e.touches[0].clientY
    startX.current = e.touches[0].clientX
    pulling.current = true
  }, [])

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!pulling.current || refreshing) return

    // 实时重判 isAtTop：用户可能在非顶部触碰后滑动到顶部，不应触发刷新
    if (!isAtTop() && pullDistanceRef.current === 0) {
      pulling.current = false
      return
    }

    const dy = e.touches[0].clientY - startY.current
    const dx = e.touches[0].clientX - startX.current

    // 垂直为主，避免与左滑删除冲突
    if (dy < 5 || Math.abs(dx) > Math.abs(dy) * 0.6) {
      pulling.current = false
      pullDistanceRef.current = 0
      setPullDistance(0)
      return
    }

    const dist = Math.min(dy * 0.4, MAX_PULL)
    pullDistanceRef.current = dist
    setPullDistance(dist)
  }, [refreshing])

  const handleTouchEnd = useCallback(async () => {
    if (!pulling.current) return
    pulling.current = false

    if (pullDistanceRef.current >= PULL_THRESHOLD * 0.4) {
      setRefreshing(true)
      pullDistanceRef.current = 50
      setPullDistance(50)
      try {
        await onRefresh()
      } finally {
        setRefreshing(false)
        pullDistanceRef.current = 0
        setPullDistance(0)
      }
    } else {
      pullDistanceRef.current = 0
      setPullDistance(0)
    }
  }, [onRefresh])

  return (
    <div
      className="pull-to-refresh-wrapper"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div
        className="pull-indicator"
        style={{
          height: `${Math.min(pullDistance + (refreshing ? 50 : 0), 50)}px`,
          opacity: Math.min((pullDistance + (refreshing ? 50 : 0)) / 40, 1),
        }}
      >
        <div className={`pull-spinner ${refreshing ? 'spinning' : ''}`}>
          <svg width="20" height="20" viewBox="0 0 20 20">
            <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="40" strokeLinecap="round" />
          </svg>
        </div>
      </div>
      {refreshing ? skeleton : children}
    </div>
  )
}
