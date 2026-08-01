import { useState, useRef, useCallback, useEffect, type ReactNode, type TouchEvent } from 'react'
import './PullToRefresh.css'

interface Props {
  onRefresh: () => Promise<void>
  skeleton: ReactNode
  children: ReactNode
}

const PULL_THRESHOLD = 60
const MAX_PULL = 100

export default function PullToRefresh({ onRefresh, skeleton, children }: Props) {
  const [pullDistance, setPullDistance] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const startY = useRef(0)
  const startX = useRef(0)
  const pulling = useRef(false)
  const scrollEl = useRef<HTMLElement | null>(null)

  useEffect(() => {
    scrollEl.current = document.querySelector('.layout-content') as HTMLElement
  }, [])

  const isAtTop = useCallback(() => {
    return scrollEl.current ? scrollEl.current.scrollTop <= 5 : true
  }, [])

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (!isAtTop()) {
      pulling.current = false
      return
    }
    startY.current = e.touches[0].clientY
    startX.current = e.touches[0].clientX
    pulling.current = true
  }, [isAtTop])

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!pulling.current || refreshing) return
    const dy = e.touches[0].clientY - startY.current
    const dx = e.touches[0].clientX - startX.current

    // 垂直为主，避免与左滑删除冲突
    if (dy < 5 || Math.abs(dx) > Math.abs(dy) * 0.6) {
      pulling.current = false
      setPullDistance(0)
      return
    }

    setPullDistance(Math.min(dy * 0.4, MAX_PULL))
  }, [refreshing])

  const handleTouchEnd = useCallback(async () => {
    if (!pulling.current) return
    pulling.current = false

    if (pullDistance >= PULL_THRESHOLD * 0.4) {
      setRefreshing(true)
      setPullDistance(50)
      try {
        await onRefresh()
      } finally {
        setRefreshing(false)
        setPullDistance(0)
      }
    } else {
      setPullDistance(0)
    }
  }, [pullDistance, onRefresh])

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
