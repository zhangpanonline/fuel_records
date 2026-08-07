import { useState, useCallback, useMemo, useRef, useEffect, type FormEvent } from 'react'
import {
  createExpense,
  updateExpense,
  deleteExpense,
  createCategory,
  type Expense,
  type CreateExpensePayload,
} from '../services/api'
import { useExpenseData } from '../context/ExpenseDataContext'
import { usePrediction } from '../context/PredictionContext'
import CategoryPicker, {
  recordCategorySelected,
  incrementCategoryCount,
  decrementCategoryCount,
} from '../components/CategoryPicker'
import ExpenseSummaryCards from '../components/ExpenseSummaryCards'
import PullToRefresh from '../components/PullToRefresh'
import ExpensePageSkeleton from '../components/ExpensePageSkeleton'
import './ExpensePage.css'

export default function ExpensePage() {
  const {
    categories,
    expenses,
    total,
    loading,
    multiSummary,
    refreshCategories,
    refreshExpenses,
    refreshMultiSummary,
    loadMoreExpenses,
  } = useExpenseData()

  // ── 金额输入 ref（供 focus_amount_input 动作使用） ──
  const amountInputRef = useRef<HTMLInputElement>(null)

  // ── 表单状态快照 ref（避免 handleQuickRecord 过期闭包） ──
  const formRef = useRef({
    amount: '',
    selectedL1: '',
    selectedL2: '',
    selectedL3: '',
    selectedL1Id: 0,
    selectedL2Id: 0,
    selectedL3Id: 0,
    expenseDate: new Date().toISOString().slice(0, 10),
    note: '',
  })

  // ── 表单状态 ──
  const [amount, setAmount] = useState('')
  const [selectedL1, setSelectedL1] = useState('')
  const [selectedL2, setSelectedL2] = useState('')
  const [selectedL3, setSelectedL3] = useState('')
  const [selectedL1Id, setSelectedL1Id] = useState(0)
  const [selectedL2Id, setSelectedL2Id] = useState(0)
  const [selectedL3Id, setSelectedL3Id] = useState(0)
  const [expenseDate, setExpenseDate] = useState(
    new Date().toISOString().slice(0, 10),
  )
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)

  // 将表单状态实时同步到 ref，避免 Action 回调中的过期闭包
  formRef.current = { amount, selectedL1, selectedL2, selectedL3, selectedL1Id, selectedL2Id, selectedL3Id, expenseDate, note }

  const prediction = usePrediction()
  const { updatePageState, pendingAction, consumePendingAction } = prediction

  // ── 同步页面状态到预测引擎 ──
  useEffect(() => {
    const now = new Date()
    const todayStr = now.toISOString().slice(0, 10)
    const hasRecordsToday = expenses.filter((e) => e.expense_date === todayStr).length > 0
    updatePageState({
      page: '/expense',
      hasRecordsToday,
      isEditing: editingId !== null,
      hour: now.getHours(),
      dayOfWeek: now.getDay(),
    })
  }, [expenses, editingId, updatePageState])

  // ── 响应预测引擎下发的 Action ──
  useEffect(() => {
    if (!pendingAction) return

    if (pendingAction.type === 'scroll_to_top') {
      window.scrollTo({ top: 0, behavior: 'smooth' })
      consumePendingAction()
    } else if (pendingAction.type === 'focus_amount_input') {
      amountInputRef.current?.focus()
      consumePendingAction()
    } else if (pendingAction.type === 'quick_record') {
      ;(async () => {
        const f = formRef.current
        if (!f.selectedL1 || !f.selectedL2 || !f.selectedL3) {
          amountInputRef.current?.focus()
          return
        }
        const numAmount = Number(f.amount) || 0
        if (numAmount <= 0) {
          amountInputRef.current?.focus()
          return
        }
        setSubmitting(true)
        try {
          await createExpense({
            amount: numAmount,
            category_l1: f.selectedL1,
            category_l2: f.selectedL2,
            category_l3: f.selectedL3,
            expense_date: f.expenseDate,
            note: f.note || undefined,
          })
          incrementCategoryCount(f.selectedL1Id, f.selectedL2Id, f.selectedL3Id)
          handleCancelEdit()
          await refreshExpenses()
          refreshMultiSummary()
        } catch {
          alert('记账失败，请重试')
        } finally {
          setSubmitting(false)
        }
      })()
      consumePendingAction()
    }
  }, [pendingAction, consumePendingAction])

  // ── 快速创建分类弹窗 ──
  const [quickCreateOpen, setQuickCreateOpen] = useState(false)

  // ── 首次加载追踪 ──
  const firstLoadDone = useRef(false)
  if (!loading && !firstLoadDone.current) {
    firstLoadDone.current = true
  }

  const showSkeleton = loading && !firstLoadDone.current

  const handlePullRefresh = useCallback(async () => {
    await refreshExpenses(1)
    refreshMultiSummary()
  }, [refreshExpenses, refreshMultiSummary])
  const [quickCreateName, setQuickCreateName] = useState('')
  const [quickCreateParentId, setQuickCreateParentId] = useState<number | null>(null)
  const [quickCreateLabel, setQuickCreateLabel] = useState('')

  // ── 左滑状态 ──
  const [swipedId, setSwipedId] = useState<number | null>(null)
  const [touchStartX, setTouchStartX] = useState(0)
  const [touchTranslateX, setTouchTranslateX] = useState(0)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const swipeEnabled = useRef(false)

  // CategoryPicker 回调
  function handleCategorySelect(l1: string, l2: string, l3: string) {
    setSelectedL1(l1)
    setSelectedL2(l2)
    setSelectedL3(l3)
  }

  function handleCategorySelected(sel: { l1: string; l2: string; l3: string; l1Id: number; l2Id: number; l3Id: number }) {
    setSelectedL1Id(sel.l1Id)
    setSelectedL2Id(sel.l2Id)
    setSelectedL3Id(sel.l3Id)
    recordCategorySelected(sel)
  }

  // 根据分类名称查找 ID（用于删除时 -1 计数）
  const findCategoryIds = useCallback(
    (l1: string, l2: string, l3: string): { l1Id: number; l2Id: number; l3Id: number } | null => {
      const c1 = categories.find((c) => c.name === l1)
      if (!c1) return null
      const c2 = c1.children?.find((c) => c.name === l2)
      if (!c2) return null
      const c3 = c2.children?.find((c) => c.name === l3)
      if (!c3) return null
      return { l1Id: c1.id, l2Id: c2.id, l3Id: c3.id }
    },
    [categories],
  )

  function openQuickCreate(parentId: number | null, label: string) {
    setQuickCreateParentId(parentId)
    setQuickCreateLabel(label)
    setQuickCreateName('')
    setQuickCreateOpen(true)
  }

  async function handleQuickCreate() {
    if (!quickCreateName.trim()) return
    try {
      const newCat = await createCategory({
        name: quickCreateName.trim(),
        parent_id: quickCreateParentId ?? undefined,
      })
      setQuickCreateOpen(false)
      const updatedCats = await refreshCategories()

      // 规格书要求：回车自动选中新创建的分类
      if (updatedCats) {
        if (newCat.level === 3 && quickCreateParentId) {
          for (const l1 of updatedCats) {
            const l2 = l1.children?.find((c) => c.id === quickCreateParentId)
            if (l2) {
              setSelectedL1(l1.name)
              setSelectedL2(l2.name)
              setSelectedL3(newCat.name)
              setSelectedL1Id(l1.id)
              setSelectedL2Id(l2.id)
              setSelectedL3Id(newCat.id)
              recordCategorySelected({
                l1: l1.name, l2: l2.name, l3: newCat.name,
                l1Id: l1.id, l2Id: l2.id, l3Id: newCat.id,
              })
              break
            }
          }
        } else if (newCat.level === 2 && quickCreateParentId) {
          const l1 = updatedCats.find((c) => c.id === quickCreateParentId)
          if (l1) {
            setSelectedL1(l1.name)
            setSelectedL2(newCat.name)
            setSelectedL3('')
            setSelectedL1Id(l1.id)
            setSelectedL2Id(newCat.id)
            setSelectedL3Id(0)
          }
        } else if (newCat.level === 1) {
          setSelectedL1(newCat.name)
          setSelectedL2('')
          setSelectedL3('')
          setSelectedL1Id(newCat.id)
          setSelectedL2Id(0)
          setSelectedL3Id(0)
        }
      }
    } catch (err: unknown) {
      console.error('创建分类失败:', err)
      alert('操作失败，请稍后重试')
    }
  }

  // 编辑：回填表单
  function handleEdit(exp: Expense) {
    setEditingId(exp.id)
    setAmount(exp.amount.toString())
    setSelectedL1(exp.category_l1)
    setSelectedL2(exp.category_l2)
    setSelectedL3(exp.category_l3)
    setExpenseDate(exp.expense_date)
    setNote(exp.note || '')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function handleCancelEdit() {
    setEditingId(null)
    setAmount('')
    setSelectedL1('')
    setSelectedL2('')
    setSelectedL3('')
    setSelectedL1Id(0)
    setSelectedL2Id(0)
    setSelectedL3Id(0)
    setNote('')
    setExpenseDate(new Date().toISOString().slice(0, 10))
  }

  // 提交
  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const numAmount = Number(amount)
    if (!numAmount || numAmount <= 0) {
      alert('请输入有效金额')
      return
    }
    if (!selectedL1 || !selectedL2 || !selectedL3) {
      alert('请选择完整的三级分类')
      return
    }

    setSubmitting(true)
    try {
      const payload: CreateExpensePayload = {
        amount: numAmount,
        category_l1: selectedL1,
        category_l2: selectedL2,
        category_l3: selectedL3,
        expense_date: expenseDate,
        note: note || undefined,
      }
      if (editingId !== null) {
        await updateExpense(editingId, payload)
      } else {
        await createExpense(payload)
        // 仅新建时 +1 计数
        incrementCategoryCount(selectedL1Id, selectedL2Id, selectedL3Id)
      }
      handleCancelEdit()
      await refreshExpenses()
      refreshMultiSummary()
    } catch (err: unknown) {
      console.error('提交失败:', err)
      alert('操作失败，请稍后重试')
    } finally {
      setSubmitting(false)
    }
  }

  // 删除
  async function handleDelete(id: number, exp: Expense) {
    if (!window.confirm('确定要删除这条记录吗？')) return
    try {
      // 先查找分类 ID（删除成功后再 -1）
      const ids = findCategoryIds(exp.category_l1, exp.category_l2, exp.category_l3)
      await deleteExpense(id)
      if (ids) {
        decrementCategoryCount(ids.l1Id, ids.l2Id, ids.l3Id)
      }
      await refreshExpenses()
      refreshMultiSummary()
    } catch (err: unknown) {
      console.error('删除失败:', err)
      alert('操作失败，请稍后重试')
    }
  }

  // 加载更多
  function handleLoadMore() {
    loadMoreExpenses()
  }

  // 按日期分组（含每日金额总和）
  const groupedExpenses = useMemo(() => {
    const groups: { date: string; items: Expense[]; dailyTotal: number }[] = []
    for (const exp of expenses) {
      const last = groups[groups.length - 1]
      if (last && last.date === exp.expense_date) {
        last.items.push(exp)
        last.dailyTotal += Number(exp.amount)
      } else {
        groups.push({ date: exp.expense_date, items: [exp], dailyTotal: Number(exp.amount) })
      }
    }
    return groups
  }, [expenses])

  // 左滑手势
  function handleTouchStart(e: React.TouchEvent, id: number) {
    // 取消上一次可能残留的计时器和状态
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
    setTouchTranslateX(0)
    setSwipedId(null)
    swipeEnabled.current = false

    setTouchStartX(e.touches[0].clientX)
    setSwipedId(id)

    // 长按 500ms 后才激活左滑
    longPressTimer.current = setTimeout(() => {
      swipeEnabled.current = true
      navigator.vibrate?.(15)
    }, 500)
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (swipedId === null) return
    if (!swipeEnabled.current) return
    const dx = e.touches[0].clientX - touchStartX
    if (dx < 0) {
      setTouchTranslateX(Math.max(dx, -80))
    } else {
      setTouchTranslateX(0)
    }
  }

  function handleTouchEnd() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
    if (!swipeEnabled.current) {
      setTouchTranslateX(0)
      setSwipedId(null)
      return
    }
    swipeEnabled.current = false
    if (touchTranslateX < -40) {
      setTouchTranslateX(-80)
    } else {
      setTouchTranslateX(0)
      setSwipedId(null)
    }
  }

  function formatDate(iso: string) {
    const d = new Date(iso)
    return `${d.getMonth() + 1}月${d.getDate()}日`
  }

  function formatTime(iso: string) {
    const d = new Date(iso)
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  if (showSkeleton) {
    return <ExpensePageSkeleton />
  }

  return (
    <PullToRefresh onRefresh={handlePullRefresh} skeleton={<ExpensePageSkeleton />}>
      <div className="expense-page">
      {/* 金额 */}
      <div className="amount-section">
        <div className="amount-input-wrapper">
          <span className="amount-yuan">¥</span>
          <input
            type="number"
            ref={amountInputRef}
            inputMode="decimal"
            className="amount-input"
            placeholder="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
      </div>

      {/* 分类选择 */}
      <div className="category-section">
        <CategoryPicker
          categories={categories}
          selectedL1={selectedL1}
          selectedL2={selectedL2}
          selectedL3={selectedL3}
          onSelect={handleCategorySelect}
          onCategorySelected={handleCategorySelected}
          onCreateNew={openQuickCreate}
        />
      </div>

      {/* 日期 + 备注 */}
      <div className="meta-row">
        <input
          type="date"
          className="date-input"
          value={expenseDate}
          onChange={(e) => setExpenseDate(e.target.value)}
        />
        <input
          type="text"
          className="note-input"
          placeholder="备注（可选）"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      {/* 提交 */}
      <div className="submit-section">
        <button
          className="submit-btn-expense"
          disabled={submitting}
          onClick={handleSubmit}
        >
          {submitting ? '提交中...' : editingId !== null ? '更新记录' : '记一笔'}
        </button>
        {editingId !== null && (
          <button className="cancel-edit-btn" onClick={handleCancelEdit}>
            取消编辑
          </button>
        )}
      </div>

      {/* 统计卡片 */}
      <ExpenseSummaryCards data={multiSummary} />

      {/* 记录列表 */}
      <section className="expense-list-section">
        {!loading && expenses.length === 0 && (
          <div className="empty-state">还没记过账</div>
        )}

        {groupedExpenses.map((group) => (
          <div key={group.date} className="expense-day-group">
            <div className="expense-day-label">
              {formatDate(group.date)}
              <span className="expense-day-total"> ¥{group.dailyTotal.toFixed(2)}</span>
            </div>
            {group.items.map((exp) => (
              <div
                key={exp.id}
                className={`expense-item ${editingId === exp.id ? 'expense-item--editing' : ''}`}
                onTouchStart={(e) => handleTouchStart(e, exp.id)}
                onTouchMove={handleTouchMove}
                onTouchEnd={() => handleTouchEnd()}
              >
                <div
                  className="expense-swipe-bg"
                  style={{
                    transform:
                      swipedId === exp.id
                        ? `translateX(${80 + touchTranslateX}px)`
                        : 'translateX(80px)',
                  }}
                  onClick={() => handleDelete(exp.id, exp)}
                >删除</div>
                <div
                  className="expense-item-inner"
                  style={{
                    transform:
                      swipedId === exp.id
                        ? `translateX(${touchTranslateX}px)`
                        : 'translateX(0)',
                  }}
                >
                  {/* 第一行：分类 */}
                  <div className="expense-item-category">
                    <span className="cat-l1">{exp.category_l1}</span>
                    <span className="cat-sep"> / </span>
                    <span className="cat-l2">{exp.category_l2}</span>
                    <span className="cat-sep"> / </span>
                    <span className="cat-l3">{exp.category_l3}</span>
                  </div>

                  {/* 第二行：金额 + 编辑 */}
                  <div className="expense-item-row2">
                    <span className="expense-item-amount">
                      -¥{Number(exp.amount).toFixed(2)}
                    </span>
                    <button
                      className="expense-edit-btn"
                      onClick={() => handleEdit(exp)}
                    >
                      编辑
                    </button>
                  </div>

                  {/* 第三行：时间 + 备注 */}
                  <div className="expense-item-row3">
                    <span className="expense-item-time">{formatTime(exp.created_at)}</span>
                    {exp.note && <span className="expense-item-dot"> · </span>}
                    {exp.note && <span>{exp.note}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ))}

        {loading && <div className="load-more-row">加载中...</div>}

        {expenses.length < total && !loading && (
          <div className="load-more-row">
            <button className="load-more-btn-expense" onClick={handleLoadMore}>
              加载更多 ({expenses.length}/{total})
            </button>
          </div>
        )}
      </section>

      {/* 快速创建弹窗 */}
      {quickCreateOpen && (
        <div
          className="quick-create-overlay"
          onClick={() => setQuickCreateOpen(false)}
        >
          <div
            className="quick-create-dialog"
            onClick={(e) => e.stopPropagation()}
          >
            <h3>新建{quickCreateLabel}</h3>
            <input
              type="text"
              placeholder="输入分类名称"
              value={quickCreateName}
              onChange={(e) => setQuickCreateName(e.target.value)}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleQuickCreate()
                if (e.key === 'Escape') setQuickCreateOpen(false)
              }}
            />
            <div className="quick-create-actions">
              <button
                className="quick-create-cancel"
                onClick={() => setQuickCreateOpen(false)}
              >
                取消
              </button>
              <button className="quick-create-confirm" onClick={handleQuickCreate}>
                创建
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </PullToRefresh>
  )
}
