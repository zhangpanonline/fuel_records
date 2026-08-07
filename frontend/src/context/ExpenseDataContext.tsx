import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef, type ReactNode } from 'react'
import {
  fetchExpenses,
  fetchCategories,
  fetchMultiSummary,
  type Expense,
  type ExpenseCategory,
  type MultiSummaryResponse,
} from '../services/api'

const PAGE_SIZE = 20

interface ExpenseData {
  categories: ExpenseCategory[]
  expenses: Expense[]
  total: number
  page: number
  loading: boolean
  multiSummary: MultiSummaryResponse | null
  multiSummaryLoading: boolean
  refreshCategories: () => Promise<ExpenseCategory[] | null>
  refreshExpenses: (pageNum?: number) => Promise<void>
  refreshMultiSummary: () => Promise<void>
  loadMoreExpenses: () => Promise<void>
}

const ExpenseDataContext = createContext<ExpenseData | null>(null)

export function ExpenseDataProvider({ children }: { children: ReactNode }) {
  const [categories, setCategories] = useState<ExpenseCategory[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [multiSummary, setMultiSummary] = useState<MultiSummaryResponse | null>(null)
  const [multiSummaryLoading, setMultiSummaryLoading] = useState(true)

  const refreshCategories = useCallback(async () => {
    try {
      const cats = await fetchCategories()
      setCategories(cats)
      return cats
    } catch {
      // 静默失败
      return null
    }
  }, [])

  const refreshExpenses = useCallback(async (pageNum = 1) => {
    setLoading(true)
    try {
      const data = await fetchExpenses(pageNum, PAGE_SIZE)
      setTotal(data.total)
      if (pageNum === 1) {
        setExpenses(data.items)
      } else {
        setExpenses((prev) => [...prev, ...data.items])
      }
      setPage(pageNum)
    } catch {
      // 静默
    } finally {
      setLoading(false)
    }
  }, [])

  const loadingRef = useRef(loading)
  loadingRef.current = loading
  const pageRef = useRef(page)
  pageRef.current = page

  const loadMoreExpenses = useCallback(async () => {
    if (loadingRef.current) return
    await refreshExpenses(pageRef.current + 1)
  }, [refreshExpenses])

  const refreshMultiSummary = useCallback(async () => {
    setMultiSummaryLoading(true)
    try {
      const data = await fetchMultiSummary()
      setMultiSummary(data)
    } catch {
      // 静默
    } finally {
      setMultiSummaryLoading(false)
    }
  }, [])

  // 首次加载
  useEffect(() => {
    refreshCategories()
    refreshExpenses()
    refreshMultiSummary()
  }, [refreshCategories, refreshExpenses, refreshMultiSummary])

  const value: ExpenseData = useMemo(() => ({
    categories,
    expenses,
    total,
    page,
    loading,
    multiSummary,
    multiSummaryLoading,
    refreshCategories,
    refreshExpenses,
    refreshMultiSummary,
    loadMoreExpenses,
  }), [
    categories,
    expenses,
    total,
    page,
    loading,
    multiSummary,
    multiSummaryLoading,
    refreshCategories,
    refreshExpenses,
    refreshMultiSummary,
    loadMoreExpenses,
  ])

  return (
    <ExpenseDataContext.Provider value={value}>
      {children}
    </ExpenseDataContext.Provider>
  )
}

export function useExpenseData() {
  const ctx = useContext(ExpenseDataContext)
  if (!ctx) throw new Error('useExpenseData must be inside ExpenseDataProvider')
  return ctx
}
