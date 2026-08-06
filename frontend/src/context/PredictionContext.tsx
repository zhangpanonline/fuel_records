/** PredictionContext — 双向状态通道（页面 → 引擎状态同步 / 引擎 → 页面动作下发） */

import {
  createContext,
  useContext,
  useRef,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react'
import { useLocation } from 'react-router-dom'
import type {
  ContextSnapshot,
  Action,
  Rule,
  PredictionContextValue,
} from '../engine/types'
import { createEngine } from '../engine/engine'

const PredictionCtx = createContext<PredictionContextValue | null>(null)

const EMPTY_CTX: ContextSnapshot = {
  page: '',
  hasRecordsToday: false,
  isFullscreen: false,
  isEditing: false,
  isFilterOpen: false,
  hour: new Date().getHours(),
  dayOfWeek: new Date().getDay(),
}

export function PredictionProvider({ children }: { children: ReactNode }) {
  const location = useLocation()
  const engineRef = useRef(createEngine())
  const ctxRef = useRef<ContextSnapshot>({ ...EMPTY_CTX })
  const pendingActionRef = useRef<Action | null>(null)

  const [currentPrediction, setCurrentPrediction] =
    useState<{ action: Action; confidence: number } | null>(null)
  const [rules, setRules] = useState<Rule[]>(() => engineRef.current.getRules())
  const [pendingAction, setPendingAction] = useState<Action | null>(null)

  // 路由变化时重新预测
  useEffect(() => {
    const ctx = { ...ctxRef.current, page: location.pathname }
    ctxRef.current = ctx
    const result = engineRef.current.predict(ctx)
    setCurrentPrediction(result)
    setRules(engineRef.current.getRules())
  }, [location.pathname])

  const updatePageState = useCallback((partial: Partial<ContextSnapshot>) => {
    const prev = ctxRef.current
    const next: ContextSnapshot = {
      ...prev,
      ...partial,
      hour: partial.hour ?? new Date().getHours(),
      dayOfWeek: partial.dayOfWeek ?? new Date().getDay(),
    }
    ctxRef.current = next
    const result = engineRef.current.predict(next)
    setCurrentPrediction(result)
    setRules(engineRef.current.getRules())
  }, [])

  const consumePendingAction = useCallback((): Action | null => {
    const action = pendingActionRef.current
    pendingActionRef.current = null
    setPendingAction(null)
    return action
  }, [])

  const recordFeedback = useCallback(
    (chosenAction: Action, wasHit: boolean) => {
      const predictedAction = currentPrediction?.action ?? null
      engineRef.current.recordFeedback(ctxRef.current, chosenAction, predictedAction, wasHit)
      setRules(engineRef.current.getRules())
    },
    [currentPrediction],
  )

  const resetAllWeights = useCallback(() => {
    engineRef.current.resetAllWeights()
    setRules(engineRef.current.getRules())
  }, [])

  const clearBehaviorLog = useCallback(() => {
    engineRef.current.clearBehaviorLog()
  }, [])

  const deleteRule = useCallback((id: string) => {
    engineRef.current.deleteRule(id)
    setRules(engineRef.current.getRules())
  }, [])

  const executeAction = useCallback(
    (action: Action) => {
      pendingActionRef.current = action
      setPendingAction(action)
    },
    [],
  )

  // 暴露到 window 供 SmartFAB 调用 recordFeedback
  useEffect(() => {
    (window as any).__fabRecordFeedback = recordFeedback
    ;(window as any).__fabExecuteAction = executeAction
    return () => {
      delete (window as any).__fabRecordFeedback
      delete (window as any).__fabExecuteAction
    }
  }, [recordFeedback, executeAction])

  return (
    <PredictionCtx.Provider
      value={{
        updatePageState,
        pendingAction,
        consumePendingAction,
        currentPrediction,
        rules,
        resetAllWeights,
        clearBehaviorLog,
        deleteRule,
      }}
    >
      {children}
    </PredictionCtx.Provider>
  )
}

export function usePrediction(): PredictionContextValue {
  const ctx = useContext(PredictionCtx)
  if (!ctx) {
    throw new Error('usePrediction must be used within PredictionProvider')
  }
  return ctx
}
